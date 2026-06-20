export const OPERATOR_CANCELLED_AFTER_PICKUP_REVIEW_ACTION =
  "operator_cancelled_after_pickup_financial_review_v1";

export const OPERATOR_RESOLVED_FINANCIAL_REVIEW_ACTION =
  "operator_resolved_financial_review_v1";

export const financialReviewResolutions = [
  "cash_not_collected",
  "manual_adjustment",
] as const;

export type FinancialReviewResolution =
  (typeof financialReviewResolutions)[number];

export function isFinancialReviewResolution(
  value: string,
): value is FinancialReviewResolution {
  return financialReviewResolutions.includes(
    value as FinancialReviewResolution,
  );
}
