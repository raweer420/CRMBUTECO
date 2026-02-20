"use server";

import { Prisma, Role, TabKind, TabStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createAuditLog } from "@/lib/audit";
import { buildRevenueLedgerEntries } from "@/lib/domain/ledger";
import {
  calculateTabTotals,
  canAddItemsToTab,
  canRegisterPayment,
  canTransitionTabStatus,
} from "@/lib/domain/tabs";
import { prisma } from "@/lib/prisma";
import { ROLE_GROUPS, hasAnyRole } from "@/lib/rbac";
import { requireUser } from "@/lib/session";
import { parseNumber, toNumber } from "@/lib/utils";

const createTabSchema = z.object({
  kind: z.nativeEnum(TabKind),
  tableNumber: z.number().int().positive().optional(),
  customerName: z.string().trim().max(120).optional(),
});

const addItemSchema = z.object({
  tabId: z.string().min(1),
  productId: z.string().min(1),
  quantity: z.number().positive(),
  note: z.string().trim().max(240).optional(),
});

const paymentSchema = z.object({
  tabId: z.string().min(1),
  method: z.enum(["PIX", "CREDIT", "DEBIT", "CASH", "VOUCHER", "FIADO"]),
  amount: z.number().positive(),
});

const updateStatusSchema = z.object({
  tabId: z.string().min(1),
  nextStatus: z.nativeEnum(TabStatus),
});

const discountSchema = z.object({
  tabId: z.string().min(1),
  discount: z.number().min(0),
});

const cancelItemSchema = z.object({
  itemId: z.string().min(1),
  reason: z.string().trim().min(3).max(250),
});

async function generateTabCode() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const now = new Date();
    const random = Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, "0");
    const code = `CMD${now.getFullYear().toString().slice(-2)}${String(
      now.getMonth() + 1,
    ).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${random}`;

    const exists = await prisma.tab.findUnique({
      where: { code },
      select: { id: true },
    });

    if (!exists) {
      return code;
    }
  }

  return `CMD-${Date.now()}`;
}

async function getTabSnapshot(tabId: string) {
  return prisma.tab.findUnique({
    where: { id: tabId },
    include: {
      items: {
        include: {
          product: true,
        },
      },
      payments: true,
    },
  });
}

function toDecimal(value: number) {
  return new Prisma.Decimal(value.toFixed(2));
}

async function reopenPaidTabIfAdmin(tabId: string, actorUserId: string) {
  const tab = await prisma.tab.findUnique({
    where: { id: tabId },
    select: { id: true, status: true },
  });

  if (!tab || tab.status !== TabStatus.PAID) {
    return;
  }

  await prisma.tab.update({
    where: { id: tabId },
    data: {
      status: TabStatus.BILLING,
      closedAt: null,
      closedById: null,
    },
  });

  await createAuditLog({
    actorUserId,
    action: "TAB_REOPENED",
    entity: "Tab",
    entityId: tabId,
    beforeJson: { status: TabStatus.PAID },
    afterJson: { status: TabStatus.BILLING },
  });
}

export async function createTabAction(formData: FormData) {
  const user = await requireUser();

  if (
    !hasAnyRole(user.role, [Role.ADMIN, Role.MANAGER, Role.CASHIER, Role.WAITER])
  ) {
    throw new Error("Sem permissão para abrir comanda.");
  }

  const parsed = createTabSchema.safeParse({
    kind: formData.get("kind"),
    tableNumber:
      formData.get("tableNumber") && formData.get("tableNumber") !== ""
        ? parseNumber(formData.get("tableNumber"))
        : undefined,
    customerName: formData.get("customerName")
      ? String(formData.get("customerName"))
      : undefined,
  });

  if (!parsed.success) {
    throw new Error("Dados inválidos para abrir comanda.");
  }

  const settings = await prisma.settings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });

  const tab = await prisma.tab.create({
    data: {
      code: await generateTabCode(),
      kind: parsed.data.kind,
      tableNumber: parsed.data.tableNumber,
      customerName: settings.enableCustomerFields ? parsed.data.customerName : null,
      openedById: user.id,
      serviceFeePercent: settings.defaultServiceFeePercent,
      status: TabStatus.OPEN,
    },
  });

  await createAuditLog({
    actorUserId: user.id,
    action: "TAB_CREATED",
    entity: "Tab",
    entityId: tab.id,
    afterJson: {
      code: tab.code,
      kind: tab.kind,
      tableNumber: tab.tableNumber,
      customerName: tab.customerName,
    },
  });

  revalidatePath("/tabs");
}

export async function addTabItemAction(formData: FormData) {
  const user = await requireUser();

  if (
    !hasAnyRole(user.role, [Role.ADMIN, Role.MANAGER, Role.CASHIER, Role.WAITER])
  ) {
    throw new Error("Sem permissão para adicionar itens.");
  }

  const parsed = addItemSchema.safeParse({
    tabId: formData.get("tabId"),
    productId: formData.get("productId"),
    quantity: parseNumber(formData.get("quantity")),
    note: formData.get("note") ? String(formData.get("note")) : undefined,
  });

  if (!parsed.success) {
    throw new Error("Item inválido.");
  }

  const [settings, tab, product] = await Promise.all([
    prisma.settings.upsert({
      where: { id: 1 },
      update: {},
      create: { id: 1 },
    }),
    prisma.tab.findUnique({
      where: { id: parsed.data.tabId },
      select: { id: true, status: true },
    }),
    prisma.product.findUnique({
      where: { id: parsed.data.productId },
    }),
  ]);

  if (!tab || !product) {
    throw new Error("Comanda ou produto não encontrado.");
  }

  if (!product.active) {
    throw new Error("Produto inativo.");
  }

  const adminOverride = user.role === Role.ADMIN;

  if (tab.status === TabStatus.PAID && adminOverride) {
    await reopenPaidTabIfAdmin(tab.id, user.id);
  }

  const canAdd = canAddItemsToTab(
    tab.status,
    settings.allowAddItemsWhenBilling,
    adminOverride,
  );

  if (!canAdd) {
    throw new Error("A comanda não permite novos itens neste status.");
  }

  const created = await prisma.tabItem.create({
    data: {
      tabId: parsed.data.tabId,
      productId: product.id,
      nameSnapshot: product.name,
      unitPriceSnapshot: product.price,
      quantity: parsed.data.quantity,
      note: parsed.data.note,
      addedById: user.id,
    },
  });

  await createAuditLog({
    actorUserId: user.id,
    action: "TAB_ITEM_ADDED",
    entity: "TabItem",
    entityId: created.id,
    afterJson: {
      tabId: created.tabId,
      name: created.nameSnapshot,
      quantity: created.quantity.toString(),
      unitPrice: created.unitPriceSnapshot.toString(),
    },
  });

  revalidatePath(`/tabs/${parsed.data.tabId}`);
  revalidatePath("/tabs");
}

export async function cancelTabItemAction(formData: FormData) {
  const user = await requireUser();

  if (!hasAnyRole(user.role, ROLE_GROUPS.canCancelItems)) {
    throw new Error("Sem permissão para cancelar itens.");
  }

  const parsed = cancelItemSchema.safeParse({
    itemId: formData.get("itemId"),
    reason: formData.get("reason"),
  });

  if (!parsed.success) {
    throw new Error("Motivo de cancelamento inválido.");
  }

  const item = await prisma.tabItem.findUnique({
    where: { id: parsed.data.itemId },
    include: {
      tab: {
        select: { id: true, status: true },
      },
    },
  });

  if (!item) {
    throw new Error("Item não encontrado.");
  }

  if (item.canceledAt) {
    throw new Error("Item já cancelado.");
  }

  const adminOverride = user.role === Role.ADMIN;
  if (item.tab.status === TabStatus.PAID && adminOverride) {
    await reopenPaidTabIfAdmin(item.tab.id, user.id);
  }

  if (item.tab.status === TabStatus.PAID && !adminOverride) {
    throw new Error("Não é possível cancelar item de comanda paga.");
  }

  const canceled = await prisma.tabItem.update({
    where: { id: item.id },
    data: {
      canceledAt: new Date(),
      canceledById: user.id,
      cancelReason: parsed.data.reason,
    },
  });

  await createAuditLog({
    actorUserId: user.id,
    action: "TAB_ITEM_CANCELED",
    entity: "TabItem",
    entityId: canceled.id,
    beforeJson: {
      canceledAt: null,
    },
    afterJson: {
      canceledAt: canceled.canceledAt?.toISOString(),
      cancelReason: canceled.cancelReason,
    },
  });

  revalidatePath(`/tabs/${item.tab.id}`);
  revalidatePath("/tabs");
}

export async function applyTabDiscountAction(formData: FormData) {
  const user = await requireUser();

  if (!hasAnyRole(user.role, ROLE_GROUPS.canApplyDiscount)) {
    throw new Error("Sem permissão para aplicar desconto.");
  }

  const parsed = discountSchema.safeParse({
    tabId: formData.get("tabId"),
    discount: parseNumber(formData.get("discount")),
  });

  if (!parsed.success) {
    throw new Error("Desconto inválido.");
  }

  const tab = await prisma.tab.findUnique({
    where: { id: parsed.data.tabId },
    select: { id: true, discount: true, status: true },
  });

  if (!tab) {
    throw new Error("Comanda não encontrada.");
  }

  const adminOverride = user.role === Role.ADMIN;
  if (tab.status === TabStatus.PAID && adminOverride) {
    await reopenPaidTabIfAdmin(tab.id, user.id);
  }

  if (tab.status === TabStatus.PAID && !adminOverride) {
    throw new Error("Não é possível alterar comanda paga.");
  }

  const updated = await prisma.tab.update({
    where: { id: tab.id },
    data: { discount: parsed.data.discount },
  });

  await createAuditLog({
    actorUserId: user.id,
    action: "TAB_DISCOUNT_APPLIED",
    entity: "Tab",
    entityId: tab.id,
    beforeJson: { discount: tab.discount.toString() },
    afterJson: { discount: updated.discount.toString() },
  });

  revalidatePath(`/tabs/${tab.id}`);
  revalidatePath("/tabs");
}

export async function addPaymentAction(formData: FormData) {
  const user = await requireUser();

  if (!hasAnyRole(user.role, ROLE_GROUPS.canOperateCashier)) {
    throw new Error("Sem permissão para registrar pagamentos.");
  }

  const parsed = paymentSchema.safeParse({
    tabId: formData.get("tabId"),
    method: formData.get("method"),
    amount: parseNumber(formData.get("amount")),
  });

  if (!parsed.success) {
    throw new Error("Pagamento inválido.");
  }

  const tab = await prisma.tab.findUnique({
    where: { id: parsed.data.tabId },
    select: { id: true, status: true },
  });

  if (!tab) {
    throw new Error("Comanda não encontrada.");
  }

  const adminOverride = user.role === Role.ADMIN;
  if (!canRegisterPayment(tab.status, adminOverride)) {
    throw new Error("A comanda não aceita pagamento neste status.");
  }

  const payment = await prisma.$transaction(async (tx) => {
    if (tab.status === TabStatus.OPEN) {
      await tx.tab.update({
        where: { id: tab.id },
        data: { status: TabStatus.BILLING },
      });
    }

    return tx.payment.create({
      data: {
        tabId: tab.id,
        method: parsed.data.method,
        amount: parsed.data.amount,
        receivedById: user.id,
      },
    });
  });

  await createAuditLog({
    actorUserId: user.id,
    action: "TAB_PAYMENT_REGISTERED",
    entity: "Payment",
    entityId: payment.id,
    afterJson: {
      tabId: payment.tabId,
      method: payment.method,
      amount: payment.amount.toString(),
    },
  });

  revalidatePath(`/tabs/${tab.id}`);
  revalidatePath("/tabs");
}

export async function updateTabStatusAction(formData: FormData) {
  const user = await requireUser();

  const parsed = updateStatusSchema.safeParse({
    tabId: formData.get("tabId"),
    nextStatus: formData.get("nextStatus"),
  });

  if (!parsed.success) {
    throw new Error("Status inválido.");
  }

  if (
    parsed.data.nextStatus === TabStatus.PAID &&
    !hasAnyRole(user.role, ROLE_GROUPS.canOperateCashier)
  ) {
    throw new Error("Sem permissão para fechar cobrança.");
  }

  if (
    parsed.data.nextStatus === TabStatus.CANCELED &&
    !hasAnyRole(user.role, [Role.ADMIN, Role.MANAGER, Role.CASHIER])
  ) {
    throw new Error("Sem permissão para cancelar comanda.");
  }

  const [tab, settings] = await Promise.all([
    getTabSnapshot(parsed.data.tabId),
    prisma.settings.upsert({
      where: { id: 1 },
      update: {},
      create: { id: 1 },
    }),
  ]);

  if (!tab) {
    throw new Error("Comanda não encontrada.");
  }

  const adminOverride = user.role === Role.ADMIN;
  const validTransition = canTransitionTabStatus(
    tab.status,
    parsed.data.nextStatus,
    adminOverride,
  );

  if (!validTransition) {
    throw new Error(`Transição inválida: ${tab.status} -> ${parsed.data.nextStatus}.`);
  }

  if (parsed.data.nextStatus !== TabStatus.PAID) {
    const updated = await prisma.tab.update({
      where: { id: tab.id },
      data: {
        status: parsed.data.nextStatus,
        closedAt:
          parsed.data.nextStatus === TabStatus.CANCELED ? new Date() : null,
        closedById:
          parsed.data.nextStatus === TabStatus.CANCELED ? user.id : null,
      },
    });

    await createAuditLog({
      actorUserId: user.id,
      action:
        parsed.data.nextStatus === TabStatus.CANCELED
          ? "TAB_CANCELED"
          : "TAB_STATUS_UPDATED",
      entity: "Tab",
      entityId: tab.id,
      beforeJson: { status: tab.status },
      afterJson: { status: updated.status },
    });

    revalidatePath(`/tabs/${tab.id}`);
    revalidatePath("/tabs");
    return;
  }

  const totals = calculateTabTotals(
    tab.items.map((item) => ({
      quantity: toNumber(item.quantity),
      unitPrice: toNumber(item.unitPriceSnapshot),
      canceled: Boolean(item.canceledAt),
    })),
    toNumber(tab.discount),
    toNumber(tab.serviceFeePercent),
  );

  const totalPaid = tab.payments.reduce(
    (sum, payment) => sum + toNumber(payment.amount),
    0,
  );
  const remaining = Math.round((totals.total - totalPaid) * 100) / 100;

  if (remaining > 0.01) {
    throw new Error(
      `Pagamento insuficiente. Falta ${remaining.toFixed(2)} para encerrar a comanda.`,
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.tab.update({
      where: { id: tab.id },
      data: {
        status: TabStatus.PAID,
        closedAt: new Date(),
        closedById: user.id,
      },
    });

    if (settings.enableStockModule) {
      const groupedStock = new Map<
        string,
        { productId: string; productName: string; quantity: number }
      >();

      for (const item of tab.items) {
        if (item.canceledAt || !item.productId || !item.product?.controlsStock) {
          continue;
        }

        const current = groupedStock.get(item.productId);
        const quantity = toNumber(item.quantity);

        if (!current) {
          groupedStock.set(item.productId, {
            productId: item.productId,
            productName: item.nameSnapshot,
            quantity,
          });
          continue;
        }

        current.quantity += quantity;
      }

      if (groupedStock.size > 0) {
        await tx.stockMovement.createMany({
          data: Array.from(groupedStock.values()).map((entry) => ({
            productId: entry.productId,
            relatedTabId: tab.id,
            type: "OUT",
            quantity: entry.quantity,
            note: `Saída automática da comanda ${tab.code}`,
            createdById: user.id,
          })),
        });
      }
    }

    let revenueCategory = await tx.accountCategory.findFirst({
      where: {
        name: "Vendas",
        type: "REVENUE",
      },
      select: { id: true },
    });

    if (!revenueCategory) {
      revenueCategory = await tx.accountCategory.create({
        data: {
          name: "Vendas",
          type: "REVENUE",
        },
        select: { id: true },
      });
    }

    const ledgerEntries = buildRevenueLedgerEntries(
      tab.payments.map((payment) => ({
        method: payment.method,
        amount: toNumber(payment.amount),
      })),
      {
        categoryId: revenueCategory.id,
        tabId: tab.id,
        createdById: user.id,
        date: new Date(),
      },
    );

    if (ledgerEntries.length > 0) {
      await tx.ledgerEntry.createMany({
        data: ledgerEntries.map((entry) => ({
          categoryId: entry.categoryId,
          relatedTabId: entry.relatedTabId,
          createdById: entry.createdById,
          date: entry.date,
          description: entry.description,
          amount: toDecimal(entry.amount),
          paymentMethod: entry.paymentMethod,
        })),
      });
    }

    await tx.auditLog.create({
      data: {
        actorUserId: user.id,
        action: "TAB_STATUS_UPDATED",
        entity: "Tab",
        entityId: tab.id,
        beforeJson: { status: tab.status },
        afterJson: { status: TabStatus.PAID, totalPaid: totalPaid.toFixed(2) },
      },
    });
  });

  revalidatePath(`/tabs/${tab.id}`);
  revalidatePath("/tabs");
  revalidatePath("/finance");
  revalidatePath("/stock");
}
