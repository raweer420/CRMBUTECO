import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type AuditPayload = {
  actorUserId: string;
  action: string;
  entity: string;
  entityId?: string | null;
  beforeJson?: Prisma.InputJsonValue | null;
  afterJson?: Prisma.InputJsonValue | null;
};

export async function createAuditLog({
  actorUserId,
  action,
  entity,
  entityId,
  beforeJson,
  afterJson,
}: AuditPayload) {
  await prisma.auditLog.create({
    data: {
      actorUserId,
      action,
      entity,
      entityId: entityId ?? null,
      beforeJson: beforeJson ?? Prisma.JsonNull,
      afterJson: afterJson ?? Prisma.JsonNull,
    },
  });
}

