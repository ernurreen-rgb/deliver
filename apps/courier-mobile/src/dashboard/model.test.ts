import { describe, expect, it } from "vitest";
import type { CourierAssignedDelivery } from "@deliver/contracts/courier";
import { formatOfferTimeLeft, getDeliveryAction } from "./model";

function delivery(
  overrides: Partial<CourierAssignedDelivery>,
): CourierAssignedDelivery {
  return {
    id: "delivery-1",
    status: "assigned",
    orderStatus: "courier_assigned",
    assignedAt: "2026-06-21T00:00:00.000Z",
    pickedUpAt: null,
    updatedAt: "2026-06-21T00:00:00.000Z",
    orderNumber: "A-1",
    restaurantName: "Tengri Kitchen",
    restaurantAddress: "Абая, 10",
    deliveryAddress: "Абая, 20",
    customerName: "Клиент",
    customerPhone: "+77000000002",
    customerTotal: 427900,
    itemsCount: 1,
    currency: "KZT",
    ...overrides,
  };
}

describe("courier dashboard model", () => {
  it("maps the ready assignment to pickup", () => {
    expect(
      getDeliveryAction(
        delivery({ orderStatus: "ready_for_pickup", status: "assigned" }),
      ).action,
    ).toBe("pickup");
  });

  it("maps picked up and delivering states", () => {
    expect(getDeliveryAction(delivery({ status: "picked_up" })).action).toBe(
      "start",
    );
    expect(getDeliveryAction(delivery({ status: "delivering" })).action).toBe(
      "complete",
    );
  });

  it("formats offer expiry without going negative", () => {
    const now = new Date("2026-06-21T00:00:00.000Z");
    expect(formatOfferTimeLeft("2026-06-21T00:00:42.000Z", now)).toBe("42 сек");
    expect(formatOfferTimeLeft("2026-06-20T23:59:00.000Z", now)).toBe("0 сек");
  });
});
