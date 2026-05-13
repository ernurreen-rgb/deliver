import { describe, expect, it } from "vitest";
import {
  OPERATOR_CANCELLED_AFTER_PICKUP_REVIEW_ACTION,
  OPERATOR_RESOLVED_FINANCIAL_REVIEW_ACTION,
  isFinancialReviewResolution,
} from "@/domains/finance/manual-review";

describe("manual financial review helpers", () => {
  it("keeps stable audit action names", () => {
    expect(OPERATOR_CANCELLED_AFTER_PICKUP_REVIEW_ACTION).toBe(
      "operator_cancelled_after_pickup_financial_review_v1",
    );
    expect(OPERATOR_RESOLVED_FINANCIAL_REVIEW_ACTION).toBe(
      "operator_resolved_financial_review_v1",
    );
  });

  it("accepts only supported V1 resolution types", () => {
    expect(isFinancialReviewResolution("cash_not_collected")).toBe(true);
    expect(isFinancialReviewResolution("manual_adjustment")).toBe(true);
    expect(isFinancialReviewResolution("cash_collected")).toBe(false);
    expect(isFinancialReviewResolution("")).toBe(false);
  });
});
