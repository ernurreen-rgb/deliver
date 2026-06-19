import { describe, expect, it } from "vitest";
import {
  isActiveSmokeFixtureDelivery,
  type SmokeDeliveryScopeCandidate,
} from "./smoke-fixture-reset";

const scope = {
  customerId: "customer-smoke",
  restaurantId: "restaurant-smoke",
};

function candidate(
  overrides: {
    status?: string;
    order?: Partial<SmokeDeliveryScopeCandidate["order"]>;
  } = {},
): SmokeDeliveryScopeCandidate {
  return {
    status: overrides.status ?? "assigned",
    order: {
      customerComment: "smoke:cash-order 2026-06-19T12:00:00.000Z",
      customerId: "customer-smoke",
      paymentMethod: "cash_to_courier",
      publicNumber: "A-2000",
      restaurantId: "restaurant-smoke",
      ...overrides.order,
    },
  };
}

describe("isActiveSmokeFixtureDelivery", () => {
  it("accepts an active order with the smoke comment prefix", () => {
    expect(isActiveSmokeFixtureDelivery(candidate(), scope)).toBe(true);
  });

  it("accepts the exact seeded A-1001 order without a smoke comment", () => {
    expect(
      isActiveSmokeFixtureDelivery(
        candidate({
          order: { customerComment: null, publicNumber: "A-1001" },
        }),
        scope,
      ),
    ).toBe(true);
  });

  it.each([
    ["customer", { order: { customerId: "customer-other" } }],
    ["restaurant", { order: { restaurantId: "restaurant-other" } }],
    ["payment method", { order: { paymentMethod: "online_card" } }],
    ["comment", { order: { customerComment: "ordinary order" } }],
  ])("rejects a candidate with the wrong %s", (_name, overrides) => {
    expect(isActiveSmokeFixtureDelivery(candidate(overrides), scope)).toBe(false);
  });

  it("is repeatable and excludes deliveries after they become terminal", () => {
    const active = candidate({ status: "delivering" });

    expect(isActiveSmokeFixtureDelivery(active, scope)).toBe(true);
    expect(isActiveSmokeFixtureDelivery(active, scope)).toBe(true);
    expect(
      isActiveSmokeFixtureDelivery(candidate({ status: "cancelled" }), scope),
    ).toBe(false);
    expect(
      isActiveSmokeFixtureDelivery(candidate({ status: "delivered" }), scope),
    ).toBe(false);
  });
});
