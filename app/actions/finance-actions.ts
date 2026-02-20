"use server";

import { AccountType, PaymentMethod, Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { ROLE_GROUPS, hasAnyRole } from "@/lib/rbac";
import { requireUser } from "@/lib/session";
import { parseNumber } from "@/lib/utils";

const ledgerEntrySchema = z.object({
  date: z.string().min(1),
  categoryId: z.string().min(1),
  description: z.string().trim().min(3).max(240),
  amount: z.number().positive(),
  paymentMethod: z.nativeEnum(PaymentMethod).optional(),
});

const accountCategorySchema = z.object({
  name: z.string().trim().min(2).max(120),
  type: z.nativeEnum(AccountType),
  parentId: z.string().optional(),
});

const cashCloseSchema = z.object({
  date: z.string().min(1),
  shift: z.string().trim().max(80).optional(),
  observation: z.string().trim().max(240).optional(),
});

const CASH_METHODS: PaymentMethod[] = [
  "PIX",
  "CREDIT",
  "DEBIT",
  "CASH",
  "VOUCHER",
  "FIADO",
];

export async function createLedgerEntryAction(formData: FormData) {
  const user = await requireUser();

  if (!hasAnyRole(user.role, [Role.ADMIN, Role.MANAGER, Role.CASHIER])) {
    throw new Error("Sem permissão para lançar no balancete.");
  }

  const paymentMethodRaw = formData.get("paymentMethod");
  const parsed = ledgerEntrySchema.safeParse({
    date: formData.get("date"),
    categoryId: formData.get("categoryId"),
    description: formData.get("description"),
    amount: parseNumber(formData.get("amount")),
    paymentMethod:
      paymentMethodRaw && paymentMethodRaw !== "NONE"
        ? paymentMethodRaw
        : undefined,
  });

  if (!parsed.success) {
    throw new Error("Lançamento financeiro inválido.");
  }

  const category = await prisma.accountCategory.findUnique({
    where: { id: parsed.data.categoryId },
  });

  if (!category) {
    throw new Error("Categoria não encontrada.");
  }

  const created = await prisma.ledgerEntry.create({
    data: {
      date: new Date(parsed.data.date),
      categoryId: category.id,
      description: parsed.data.description,
      amount: parsed.data.amount,
      paymentMethod: parsed.data.paymentMethod,
      createdById: user.id,
    },
  });

  await createAuditLog({
    actorUserId: user.id,
    action: "LEDGER_MANUAL_CREATED",
    entity: "LedgerEntry",
    entityId: created.id,
    afterJson: {
      categoryId: created.categoryId,
      amount: created.amount.toString(),
      paymentMethod: created.paymentMethod,
      description: created.description,
    },
  });

  revalidatePath("/finance");
  revalidatePath("/cash-close");
}

export async function createAccountCategoryAction(formData: FormData) {
  const user = await requireUser();

  if (!hasAnyRole(user.role, [Role.ADMIN, Role.MANAGER])) {
    throw new Error("Sem permissão para criar categoria.");
  }

  const parentIdRaw = formData.get("parentId");

  const parsed = accountCategorySchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type"),
    parentId: parentIdRaw && parentIdRaw !== "" ? String(parentIdRaw) : undefined,
  });

  if (!parsed.success) {
    throw new Error("Categoria inválida.");
  }

  const created = await prisma.accountCategory.create({
    data: {
      name: parsed.data.name,
      type: parsed.data.type,
      parentId: parsed.data.parentId,
    },
  });

  await createAuditLog({
    actorUserId: user.id,
    action: "ACCOUNT_CATEGORY_CREATED",
    entity: "AccountCategory",
    entityId: created.id,
    afterJson: {
      name: created.name,
      type: created.type,
      parentId: created.parentId,
    },
  });

  revalidatePath("/finance");
}

function startOfDay(date: Date) {
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  return dayStart;
}

function nextDay(date: Date) {
  const result = startOfDay(date);
  result.setDate(result.getDate() + 1);
  return result;
}

export async function createCashCloseAction(formData: FormData) {
  const user = await requireUser();

  if (!hasAnyRole(user.role, ROLE_GROUPS.canOperateCashier)) {
    throw new Error("Sem permissão para fechamento de caixa.");
  }

  const parsed = cashCloseSchema.safeParse({
    date: formData.get("date"),
    shift: formData.get("shift") ? String(formData.get("shift")) : undefined,
    observation: formData.get("observation")
      ? String(formData.get("observation"))
      : undefined,
  });

  if (!parsed.success) {
    throw new Error("Dados inválidos para fechamento de caixa.");
  }

  const closeDate = new Date(parsed.data.date);
  const from = startOfDay(closeDate);
  const to = nextDay(closeDate);

  const entries = await prisma.ledgerEntry.findMany({
    where: {
      date: {
        gte: from,
        lt: to,
      },
      paymentMethod: {
        not: null,
      },
    },
    include: {
      category: {
        select: {
          type: true,
        },
      },
    },
  });

  const expectedByMethod = CASH_METHODS.reduce<Record<PaymentMethod, number>>(
    (acc, method) => {
      acc[method] = 0;
      return acc;
    },
    {
      PIX: 0,
      CREDIT: 0,
      DEBIT: 0,
      CASH: 0,
      VOUCHER: 0,
      FIADO: 0,
    },
  );

  for (const entry of entries) {
    if (!entry.paymentMethod) {
      continue;
    }

    const signal = entry.category.type === "REVENUE" ? 1 : -1;
    expectedByMethod[entry.paymentMethod] += Number(entry.amount) * signal;
  }

  const countedByMethod = CASH_METHODS.reduce<Record<PaymentMethod, number>>(
    (acc, method) => {
      acc[method] = parseNumber(formData.get(`counted_${method}`), 0);
      return acc;
    },
    {
      PIX: 0,
      CREDIT: 0,
      DEBIT: 0,
      CASH: 0,
      VOUCHER: 0,
      FIADO: 0,
    },
  );

  const expectedTotal = Object.values(expectedByMethod).reduce(
    (sum, value) => sum + value,
    0,
  );
  const countedTotal = Object.values(countedByMethod).reduce(
    (sum, value) => sum + value,
    0,
  );
  const difference = Math.round((countedTotal - expectedTotal) * 100) / 100;

  const created = await prisma.cashClose.create({
    data: {
      date: from,
      shift: parsed.data.shift,
      totalsByMethod: expectedByMethod,
      countedByMethod,
      difference,
      observation: parsed.data.observation,
      closedById: user.id,
    },
  });

  await createAuditLog({
    actorUserId: user.id,
    action: "CASH_CLOSE_CREATED",
    entity: "CashClose",
    entityId: created.id,
    afterJson: {
      date: from.toISOString(),
      totalsByMethod: expectedByMethod,
      countedByMethod,
      difference,
    },
  });

  revalidatePath("/cash-close");
  revalidatePath("/finance");
}

