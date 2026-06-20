import { describe, expect, it, vi } from "vitest";
import { writeAuditLog } from "@/domains/audit/log";

describe("writeAuditLog", () => {
  it("writes a normalized audit record", async () => {
    const create = vi.fn().mockResolvedValue({ id: "audit-1" });

    await writeAuditLog({
      tx: {
        auditLog: {
          create,
        },
      } as never,
      actorUserId: "user-1",
      entityType: "order",
      entityId: "order-1",
      action: "order_delivered_v1",
      metadata: {
        publicNumber: "ORD-1",
      },
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        actorUserId: "user-1",
        entityType: "order",
        entityId: "order-1",
        action: "order_delivered_v1",
        metadata: {
          publicNumber: "ORD-1",
        },
      },
    });
  });
});
