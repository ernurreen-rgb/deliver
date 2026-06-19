import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  isDispatchTickDryRunEnabled,
  isDispatchRecoverableOrderStatus,
  runDispatchTick,
  shouldRedispatchPendingDelivery,
} from "@/domains/delivery/dispatch-job";

const dispatchMocks = vi.hoisted(() => ({
  dispatchNextCourierOffer: vi.fn(),
  expireCourierOffers: vi.fn(),
}));

const prismaMocks = vi.hoisted(() => ({
  prisma: {
    courierOffer: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    delivery: {
      createMany: vi.fn(),
      findMany: vi.fn(),
    },
    order: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/domains/delivery/dispatch", () => dispatchMocks);

vi.mock("@/lib/db/prisma", () => ({
  getPrisma: () => prismaMocks.prisma,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("isDispatchTickDryRunEnabled", () => {
  it("accepts explicit dry-run query values only", () => {
    expect(isDispatchTickDryRunEnabled(new URLSearchParams("dryRun=1"))).toBe(
      true,
    );
    expect(isDispatchTickDryRunEnabled(new URLSearchParams("dry-run=true"))).toBe(
      true,
    );
    expect(isDispatchTickDryRunEnabled(new URLSearchParams("dryRun=yes"))).toBe(
      true,
    );

    expect(isDispatchTickDryRunEnabled(new URLSearchParams(""))).toBe(false);
    expect(isDispatchTickDryRunEnabled(new URLSearchParams("dryRun=0"))).toBe(
      false,
    );
  });
});

describe("isDispatchRecoverableOrderStatus", () => {
  it("allows only restaurant-confirmed states that can still receive courier offers", () => {
    expect(isDispatchRecoverableOrderStatus("accepted")).toBe(true);
    expect(isDispatchRecoverableOrderStatus("preparing")).toBe(true);
    expect(isDispatchRecoverableOrderStatus("ready_for_pickup")).toBe(true);

    expect(isDispatchRecoverableOrderStatus("pending_confirmation")).toBe(false);
    expect(isDispatchRecoverableOrderStatus("courier_assigned")).toBe(false);
    expect(isDispatchRecoverableOrderStatus("cancelled")).toBe(false);
  });
});

describe("shouldRedispatchPendingDelivery", () => {
  it("selects pending deliveries without courier and without active offer", () => {
    expect(
      shouldRedispatchPendingDelivery({
        deliveryStatus: "pending_assignment",
        courierId: null,
        orderStatus: "ready_for_pickup",
        hasActivePendingOffer: false,
      }),
    ).toBe(true);
  });

  it("does not interrupt active offers or assigned deliveries", () => {
    expect(
      shouldRedispatchPendingDelivery({
        deliveryStatus: "pending_assignment",
        courierId: null,
        orderStatus: "preparing",
        hasActivePendingOffer: true,
      }),
    ).toBe(false);

    expect(
      shouldRedispatchPendingDelivery({
        deliveryStatus: "assigned",
        courierId: "courier-1",
        orderStatus: "ready_for_pickup",
        hasActivePendingOffer: false,
      }),
    ).toBe(false);
  });
});

describe("runDispatchTick dry-run", () => {
  it("reports candidates without expiring offers, creating deliveries or dispatching couriers", async () => {
    prismaMocks.prisma.courierOffer.findMany.mockResolvedValue([
      { deliveryId: "expired-delivery-1" },
    ]);
    prismaMocks.prisma.courierOffer.count.mockResolvedValue(2);
    prismaMocks.prisma.order.findMany.mockResolvedValue([{ id: "order-1" }]);
    prismaMocks.prisma.delivery.findMany.mockResolvedValue([
      { id: "redispatch-delivery-1" },
    ]);

    const summary = await runDispatchTick({
      now: new Date("2026-05-30T00:00:00.000Z"),
      limit: 10,
      dryRun: true,
    });

    expect(summary).toMatchObject({
      dryRun: true,
      expiredOffers: 2,
      expiredDeliveries: 1,
      missingDeliveryCandidates: 1,
      createdDeliveries: 0,
      redispatchCandidates: 1,
    });
    expect(summary.dispatchResults.offer_created).toBe(0);

    expect(dispatchMocks.expireCourierOffers).not.toHaveBeenCalled();
    expect(dispatchMocks.dispatchNextCourierOffer).not.toHaveBeenCalled();
    expect(prismaMocks.prisma.delivery.createMany).not.toHaveBeenCalled();
  });
});
