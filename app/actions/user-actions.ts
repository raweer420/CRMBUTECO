"use server";

import { Role } from "@prisma/client";
import { randomUUID } from "node:crypto";
import bcrypt from "bcrypt";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { ROLE_GROUPS, hasAnyRole } from "@/lib/rbac";
import { requireUser } from "@/lib/session";

const createUserSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().email(),
  role: z.nativeEnum(Role),
});

const updateRoleSchema = z.object({
  userId: z.string().min(1),
  role: z.nativeEnum(Role),
});

export async function createUserAction(formData: FormData) {
  const actor = await requireUser();

  if (!hasAnyRole(actor.role, ROLE_GROUPS.canManageUsers)) {
    throw new Error("Sem permissao para criar usuario.");
  }

  const parsed = createUserSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    role: formData.get("role"),
  });

  if (!parsed.success) {
    throw new Error("Dados invalidos para usuario.");
  }

  const email = parsed.data.email.toLowerCase();

  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) {
    throw new Error("Email ja cadastrado.");
  }

  // Sem login por senha: mantemos um hash tecnico para satisfazer o schema atual.
  const technicalHash = await bcrypt.hash(randomUUID(), 10);

  const created = await prisma.user.create({
    data: {
      name: parsed.data.name,
      email,
      passwordHash: technicalHash,
      role: parsed.data.role,
      active: true,
    },
  });

  await createAuditLog({
    actorUserId: actor.id,
    action: "USER_CREATED",
    entity: "User",
    entityId: created.id,
    afterJson: {
      name: created.name,
      email: created.email,
      role: created.role,
      active: created.active,
    },
  });

  revalidatePath("/users");
}

export async function updateUserRoleAction(formData: FormData) {
  const actor = await requireUser();

  if (!hasAnyRole(actor.role, ROLE_GROUPS.canManageUsers)) {
    throw new Error("Sem permissao para alterar perfis.");
  }

  const parsed = updateRoleSchema.safeParse({
    userId: formData.get("userId"),
    role: formData.get("role"),
  });

  if (!parsed.success) {
    throw new Error("Perfil invalido.");
  }

  const before = await prisma.user.findUnique({
    where: { id: parsed.data.userId },
  });

  if (!before) {
    throw new Error("Usuario nao encontrado.");
  }

  const updated = await prisma.user.update({
    where: { id: parsed.data.userId },
    data: { role: parsed.data.role },
  });

  await createAuditLog({
    actorUserId: actor.id,
    action: "USER_ROLE_UPDATED",
    entity: "User",
    entityId: updated.id,
    beforeJson: { role: before.role },
    afterJson: { role: updated.role },
  });

  revalidatePath("/users");
}

export async function toggleUserActiveAction(formData: FormData) {
  const actor = await requireUser();

  if (!hasAnyRole(actor.role, ROLE_GROUPS.canManageUsers)) {
    throw new Error("Sem permissao para ativar/inativar usuarios.");
  }

  const userId = String(formData.get("userId") ?? "");
  if (!userId) {
    throw new Error("Usuario invalido.");
  }

  if (userId === actor.id) {
    throw new Error("Voce nao pode inativar a propria conta.");
  }

  const before = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!before) {
    throw new Error("Usuario nao encontrado.");
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      active: !before.active,
    },
  });

  await createAuditLog({
    actorUserId: actor.id,
    action: "USER_STATUS_UPDATED",
    entity: "User",
    entityId: updated.id,
    beforeJson: { active: before.active },
    afterJson: { active: updated.active },
  });

  revalidatePath("/users");
}
