import { describe, expect, it } from "vitest";
import { buildCashSettlementLedger } from "@/domains/finance/order-settlement";

describe("buildCashSettlementLedger", () => {
  it("builds balanced restaurant and courier ledger entries for cash delivery", () => {
    const settlement = buildCashSettlementLedger({
      customerTotal: 4_200_00,
      itemsSubtotal: 3_600_00,
      restaurantCommission: 540_00,
      restaurantPayout: 3_060_00,
      courierEarning: 500_00,
      currency: "KZT",
    });

    expect(settlement.restaurantBalanceDelta).toBe(3_060_00);
    expect(settlement.restaurantEntries).toEqual([
      expect.objectContaining({
        type: "restaurant_order_payout",
        amount: 3_600_00,
      }),
      expect.objectContaining({
        type: "restaurant_commission",
        amount: -540_00,
      }),
    ]);

    expect(settlement.courierBalanceDelta).toBe(-3_700_00);
    expect(settlement.courierEntries).toEqual([
      expect.objectContaining({
        type: "cash_collected",
        amount: -4_200_00,
      }),
      expect.objectContaining({
        type: "order_earning",
        amount: 500_00,
      }),
    ]);
  });
});
