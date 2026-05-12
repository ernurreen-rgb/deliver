import { describe, expect, it } from "vitest";
import {
  isDispatchRecoverableOrderStatus,
  shouldRedispatchPendingDelivery,
} from "@/domains/delivery/dispatch-job";

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
