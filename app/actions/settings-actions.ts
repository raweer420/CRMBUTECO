"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { ROLE_GROUPS, hasAnyRole } from "@/lib/rbac";
import { requireUser } from "@/lib/session";
import { parseNumber } from "@/lib/utils";

const settingsSchema = z.object({
  allowAddItemsWhenBilling: z.boolean(),
  defaultServiceFeePercent: z.number().min(0).max(100),
  enableStockModule: z.boolean(),
  enableCustomerFields: z.boolean(),
});

export async function updateSettingsAction(formData: FormData) {
  const user = await requireUser();

  if (!hasAnyRole(user.role, ROLE_GROUPS.canManageSettings)) {
    throw new Error("Sem permissão para alterar configurações.");
  }

  const parsed = settingsSchema.safeParse({
    allowAddItemsWhenBilling: formData.get("allowAddItemsWhenBilling") === "on",
    defaultServiceFeePercent: parseNumber(formData.get("defaultServiceFeePercent"), 10),
    enableStockModule: formData.get("enableStockModule") === "on",
    enableCustomerFields: formData.get("enableCustomerFields") === "on",
  });

  if (!parsed.success) {
    throw new Error("Configurações inválidas.");
  }

  const before = await prisma.settings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });

  const after = await prisma.settings.update({
    where: { id: 1 },
    data: {
      allowAddItemsWhenBilling: parsed.data.allowAddItemsWhenBilling,
      defaultServiceFeePercent: parsed.data.defaultServiceFeePercent,
      enableStockModule: parsed.data.enableStockModule,
      enableCustomerFields: parsed.data.enableCustomerFields,
      updatedById: user.id,
    },
  });

  await createAuditLog({
    actorUserId: user.id,
    action: "SETTINGS_UPDATED",
    entity: "Settings",
    entityId: String(after.id),
    beforeJson: {
      allowAddItemsWhenBilling: before.allowAddItemsWhenBilling,
      defaultServiceFeePercent: before.defaultServiceFeePercent.toString(),
      enableStockModule: before.enableStockModule,
      enableCustomerFields: before.enableCustomerFields,
    },
    afterJson: {
      allowAddItemsWhenBilling: after.allowAddItemsWhenBilling,
      defaultServiceFeePercent: after.defaultServiceFeePercent.toString(),
      enableStockModule: after.enableStockModule,
      enableCustomerFields: after.enableCustomerFields,
    },
  });

  revalidatePath("/settings");
  revalidatePath("/tabs");
}
