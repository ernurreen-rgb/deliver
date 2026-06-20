import { describe, expect, it } from "vitest";
import {
  getOrderPaymentStatusAfterCancellation,
  isCancellablePaymentStatus,
} from "@/domains/finance/payment-status";

describe("isCancellablePaymentStatus", () => {
  it("allows only not-yet-captured payment states to be cancelled", () => {
    expect(isCancellablePaymentStatus("pending")).toBe(true);
    expect(isCancellablePaymentStatus("authorized")).toBe(true);

    expect(isCancellablePaymentStatus("paid")).toBe(false);
    expect(isCancellablePaymentStatus("failed")).toBe(false);
    expect(isCancellablePaymentStatus("cancelled")).toBe(false);
    expect(isCancellablePaymentStatus("refunded")).toBe(false);
    expect(isCancellablePaymentStatus("partially_refunded")).toBe(false);
  });
});

describe("getOrderPaymentStatusAfterCancellation", () => {
  it("marks pending and authorized order payments as cancelled", () => {
    expect(
      getOrderPaymentStatusAfterCancellation({ currentStatus: "pending" }),
    ).toBe("cancelled");
    expect(
      getOrderPaymentStatusAfterCancellation({ currentStatus: "authorized" }),
    ).toBe("cancelled");
  });

  it("keeps settled or terminal payment states unchanged", () => {
    expect(
      getOrderPaymentStatusAfterCancellation({ currentStatus: "paid" }),
    ).toBeUndefined();
    expect(
      getOrderPaymentStatusAfterCancellation({ currentStatus: "failed" }),
    ).toBeUndefined();
    expect(
      getOrderPaymentStatusAfterCancellation({ currentStatus: "refunded" }),
    ).toBeUndefined();
  });

  it("does not change order payment status when manual financial review is required", () => {
    expect(
      getOrderPaymentStatusAfterCancellation({
        currentStatus: "pending",
        requiresFinancialReview: true,
      }),
    ).toBeUndefined();
  });
});
