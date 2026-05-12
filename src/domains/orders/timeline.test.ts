import { describe, expect, it } from "vitest";
import { buildOrderTimeline } from "@/domains/orders/timeline";

describe("buildOrderTimeline", () => {
  it("combines status history with supplemental audit events", () => {
    const timeline = buildOrderTimeline({
      order: { status: "delivering" },
      delivery: {
        status: "delivering",
        hasCourier: true,
        hasPendingOffer: false,
      },
      statusHistory: [
        {
          id: "history-1",
          fromStatus: null,
          toStatus: "pending_confirmation",
          comment: "Заказ создан клиентом.",
          createdAt: new Date("2026-05-12T10:00:00.000Z"),
          changedBy: {
            id: "user-1",
            name: "Клиент",
            phone: "+77000000000",
          },
        },
      ],
      auditLogs: [
        {
          id: "audit-1",
          action: "operator_restarted_dispatch_v1",
          metadata: { result: "offer_created" },
          createdAt: new Date("2026-05-12T10:01:00.000Z"),
          actor: {
            id: "operator-1",
            name: "Оператор",
            phone: "+77000000001",
          },
        },
      ],
    });

    expect(timeline.currentStep.title).toBe("Курьер в пути");
    expect(timeline.nextStep.title).toBe("Завершить доставку");
    expect(timeline.events).toHaveLength(2);
    expect(timeline.events[0]).toMatchObject({
      title: "Оператор перезапустил автоназначение",
      actor: "Оператор",
      source: "audit",
    });
  });
});
