import { describe, expect, it } from "vitest";
import {
  getOrderStatusAfterCourierRelease,
  isReleasableAssignedOrderStatus,
} from "@/domains/delivery/lifecycle";

describe("isReleasableAssignedOrderStatus", () => {
  it("allows only assigned-but-not-picked-up order states", () => {
    expect(isReleasableAssignedOrderStatus("courier_assigned")).toBe(true);
    expect(isReleasableAssignedOrderStatus("preparing")).toBe(true);
    expect(isReleasableAssignedOrderStatus("ready_for_pickup")).toBe(true);

    expect(isReleasableAssignedOrderStatus("picked_up")).toBe(false);
    expect(isReleasableAssignedOrderStatus("delivering")).toBe(false);
    expect(isReleasableAssignedOrderStatus("delivered")).toBe(false);
  });
});

describe("getOrderStatusAfterCourierRelease", () => {
  it("returns courier_assigned orders to accepted and keeps kitchen states", () => {
    expect(getOrderStatusAfterCourierRelease("courier_assigned")).toBe("accepted");
    expect(getOrderStatusAfterCourierRelease("preparing")).toBe("preparing");
    expect(getOrderStatusAfterCourierRelease("ready_for_pickup")).toBe(
      "ready_for_pickup",
    );
  });
});
