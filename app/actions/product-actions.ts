"use server";

import { Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { ROLE_GROUPS, hasAnyRole } from "@/lib/rbac";
import { requireUser } from "@/lib/session";
import { parseNumber } from "@/lib/utils";

const productSchema = z.object({
  name: z.string().trim().min(2).max(120),
  category: z.string().trim().min(2).max(80),
  price: z.number().positive(),
  cost: z.number().min(0).optional(),
  controlsStock: z.boolean(),
  minStock: z.number().min(0).optional(),
});

export async function createProductAction(formData: FormData) {
  const user = await requireUser();

  if (!hasAnyRole(user.role, ROLE_GROUPS.canManageProducts)) {
    throw new Error("Sem permissão para cadastrar produtos.");
  }

  const parsed = productSchema.safeParse({
    name: formData.get("name"),
    category: formData.get("category"),
    price: parseNumber(formData.get("price")),
    cost:
      formData.get("cost") && formData.get("cost") !== ""
        ? parseNumber(formData.get("cost"))
        : undefined,
    controlsStock: formData.get("controlsStock") === "on",
    minStock:
      formData.get("minStock") && formData.get("minStock") !== ""
        ? parseNumber(formData.get("minStock"))
        : undefined,
  });

  if (!parsed.success) {
    throw new Error("Dados inválidos para produto.");
  }

  const created = await prisma.product.create({
    data: {
      name: parsed.data.name,
      category: parsed.data.category,
      price: parsed.data.price,
      cost: parsed.data.cost,
      controlsStock: parsed.data.controlsStock,
      minStock: parsed.data.controlsStock ? parsed.data.minStock : null,
    },
  });

  await createAuditLog({
    actorUserId: user.id,
    action: "PRODUCT_CREATED",
    entity: "Product",
    entityId: created.id,
    afterJson: {
      name: created.name,
      category: created.category,
      price: created.price.toString(),
    },
  });

  revalidatePath("/products");
  revalidatePath("/tabs");
}

export async function updateProductAction(formData: FormData) {
  const user = await requireUser();

  if (!hasAnyRole(user.role, [Role.ADMIN, Role.MANAGER])) {
    throw new Error("Sem permissão para editar produtos.");
  }

  const productId = String(formData.get("productId") ?? "");
  if (!productId) {
    throw new Error("Produto inválido.");
  }

  const parsed = productSchema.safeParse({
    name: formData.get("name"),
    category: formData.get("category"),
    price: parseNumber(formData.get("price")),
    cost:
      formData.get("cost") && formData.get("cost") !== ""
        ? parseNumber(formData.get("cost"))
        : undefined,
    controlsStock: formData.get("controlsStock") === "on",
    minStock:
      formData.get("minStock") && formData.get("minStock") !== ""
        ? parseNumber(formData.get("minStock"))
        : undefined,
  });

  if (!parsed.success) {
    throw new Error("Dados inválidos para produto.");
  }

  const before = await prisma.product.findUnique({
    where: { id: productId },
  });

  if (!before) {
    throw new Error("Produto não encontrado.");
  }

  const updated = await prisma.product.update({
    where: { id: productId },
    data: {
      name: parsed.data.name,
      category: parsed.data.category,
      price: parsed.data.price,
      cost: parsed.data.cost,
      controlsStock: parsed.data.controlsStock,
      minStock: parsed.data.controlsStock ? parsed.data.minStock : null,
    },
  });

  await createAuditLog({
    actorUserId: user.id,
    action: "PRODUCT_UPDATED",
    entity: "Product",
    entityId: updated.id,
    beforeJson: {
      name: before.name,
      category: before.category,
      price: before.price.toString(),
      active: before.active,
    },
    afterJson: {
      name: updated.name,
      category: updated.category,
      price: updated.price.toString(),
      active: updated.active,
    },
  });

  revalidatePath("/products");
  revalidatePath("/tabs");
}

export async function toggleProductActiveAction(formData: FormData) {
  const user = await requireUser();

  if (!hasAnyRole(user.role, ROLE_GROUPS.canManageProducts)) {
    throw new Error("Sem permissão para inativar produtos.");
  }

  const productId = String(formData.get("productId") ?? "");
  if (!productId) {
    throw new Error("Produto inválido.");
  }

  const before = await prisma.product.findUnique({
    where: { id: productId },
  });

  if (!before) {
    throw new Error("Produto não encontrado.");
  }

  const updated = await prisma.product.update({
    where: { id: productId },
    data: {
      active: !before.active,
    },
  });

  await createAuditLog({
    actorUserId: user.id,
    action: "PRODUCT_STATUS_UPDATED",
    entity: "Product",
    entityId: updated.id,
    beforeJson: { active: before.active },
    afterJson: { active: updated.active },
  });

  revalidatePath("/products");
  revalidatePath("/tabs");
}

