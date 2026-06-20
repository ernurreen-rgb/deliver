import { Prisma } from "@/generated/prisma/client";

type AuditLogClient = Pick<Prisma.TransactionClient, "auditLog">;

export async function writeAuditLog(input: {
  tx: AuditLogClient;
  actorUserId?: string | null;
  entityType: string;
  entityId: string;
  action: string;
  metadata?: Prisma.InputJsonValue;
}) {
  return input.tx.auditLog.create({
    data: {
      actorUserId: input.actorUserId ?? null,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
    },
  });
}
