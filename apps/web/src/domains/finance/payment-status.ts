import type { PaymentStatus } from "@/generated/prisma/enums";

export const cancellablePaymentStatuses = [
  "pending",
  "authorized",
] as const satisfies readonly PaymentStatus[];

type CancellablePaymentStatus = (typeof cancellablePaymentStatuses)[number];

export function isCancellablePaymentStatus(
  status: PaymentStatus,
): status is CancellablePaymentStatus {
  return cancellablePaymentStatuses.includes(
    status as CancellablePaymentStatus,
  );
}

export function getOrderPaymentStatusAfterCancellation(input: {
  currentStatus: PaymentStatus;
  requiresFinancialReview?: boolean;
}): PaymentStatus | undefined {
  if (input.requiresFinancialReview) {
    return undefined;
  }

  return isCancellablePaymentStatus(input.currentStatus)
    ? "cancelled"
    : undefined;
}
