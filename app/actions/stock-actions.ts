"use server";

import { StockMovementType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { ROLE_GROUPS, hasAnyRole } from "@/lib/rbac";
import { requireUser } from "@/lib/session";
import { parseNumber } from "@/lib/utils";

const stockMovementSchema = z.object({
  productId: z.string().min(1),
  type: z.nativeEnum(StockMovementType),
  quantity: z.number().positive(),
  unitCost: z.number().min(0).optional(),
  note: z.string().trim().min(3).max(240),
});

export async function createStockMovementAction(formData: FormData) {
  const user = await requireUser();

  if (!hasAnyRole(user.role, ROLE_GROUPS.canManageStock)) {
    throw new Error("Sem permissão para movimentar estoque.");
  }

  const parsed = stockMovementSchema.safeParse({
    productId: formData.get("productId"),
    type: formData.get("type"),
    quantity: parseNumber(formData.get("quantity")),
    unitCost:
      formData.get("unitCost") && formData.get("unitCost") !== ""
        ? parseNumber(formData.get("unitCost"))
        : undefined,
    note: formData.get("note"),
  });

  if (!parsed.success) {
    throw new Error("Movimento inválido.");
  }

  const product = await prisma.product.findUnique({
    where: { id: parsed.data.productId },
    select: { id: true, name: true },
  });

  if (!product) {
    throw new Error("Produto não encontrado.");
  }

  const created = await prisma.stockMovement.create({
    data: {
      productId: product.id,
      type: parsed.data.type,
      quantity: parsed.data.quantity,
      unitCost: parsed.data.unitCost,
      note: parsed.data.note,
      createdById: user.id,
    },
  });

  await createAuditLog({
    actorUserId: user.id,
    action: "STOCK_ADJUSTED",
    entity: "StockMovement",
    entityId: created.id,
    afterJson: {
      productId: created.productId,
      type: created.type,
      quantity: created.quantity.toString(),
      unitCost: created.unitCost?.toString() ?? null,
    },
  });

  revalidatePath("/stock");
}
