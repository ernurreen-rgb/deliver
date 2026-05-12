import { describe, expect, it } from "vitest";
import {
  canSetCourierStatus,
  isOperatorSettableCourierStatus,
  isTransportType,
} from "@/domains/couriers/operations";

describe("courier operations guards", () => {
  it("allows only operator-managed statuses", () => {
    expect(isOperatorSettableCourierStatus("inactive")).toBe(true);
    expect(isOperatorSettableCourierStatus("available")).toBe(true);
    expect(isOperatorSettableCourierStatus("suspended")).toBe(true);
    expect(isOperatorSettableCourierStatus("busy")).toBe(false);
  });

  it("requires location before setting courier available", () => {
    expect(
      canSetCourierStatus({
        targetStatus: "available",
        activeDeliveryCount: 0,
        hasLocation: false,
      }),
    ).toBe("courier_location_required");
  });

  it("blocks manual status changes during active delivery", () => {
    expect(
      canSetCourierStatus({
        targetStatus: "inactive",
        activeDeliveryCount: 1,
        hasLocation: true,
      }),
    ).toBe("active_delivery_exists");
  });

  it("validates transport types", () => {
    expect(isTransportType("car")).toBe(true);
    expect(isTransportType("truck")).toBe(false);
  });
});
