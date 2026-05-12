import { Prisma } from "@/generated/prisma/client";
import type { PaymentProvider, PaymentStatus } from "@/generated/prisma/enums";

type CashSettlementInput = {
  customerTotal: number;
  itemsSubtotal: number;
  restaurantCommission: number;
  restaurantPayout: number;
  courierEarning: number;
  currency: string;
};

type SettlementPayment = {
  id: string;
  method: string;
  status: PaymentStatus;
  amount: number;
  currency: string;
  provider: PaymentProvider;
};

type SettlementOrder = {
  id: string;
  publicNumber: string;
  restaurantId: string;
  paymentMethod: string;
  financials: CashSettlementInput | null;
  payments: SettlementPayment[];
};

export type FinancialSettlementErrorStatus =
  | "financial_record_missing"
  | "payment_record_missing"
  | "payment_amount_mismatch"
  | "unsupported_payment_method";

export class FinancialSettlementError extends Error {
  constructor(
    readonly status: FinancialSettlementErrorStatus,
    readonly publicNumber: string,
  ) {
    super(status);
  }
}

const payablePaymentStatuses = new Set<PaymentStatus>(["pending", "authorized"]);

export function buildCashSettlementLedger(input: CashSettlementInput) {
  const restaurantGrossSale = input.itemsSubtotal;
  const restaurantCommission = -input.restaurantCommission;
  const restaurantBalanceDelta = input.restaurantPayout;
  const courierCashCollected = -input.customerTotal;
  const courierEarning = input.courierEarning;
  const courierBalanceDelta = courierCashCollected + courierEarning;

  return {
    currency: input.currency,
    restaurantBalanceDelta,
    courierBalanceDelta,
    restaurantEntries: [
      {
        type: "restaurant_order_payout" as const,
        amount: restaurantGrossSale,
        description: "Gross food subtotal for delivered order.",
      },
      {
        type: "restaurant_commission" as const,
        amount: restaurantCommission,
        description: "Platform commission for delivered order.",
      },
    ],
    courierEntries: [
      {
        type: "cash_collected" as const,
        amount: courierCashCollected,
        description: "Cash collected from customer.",
      },
      {
        type: "order_earning" as const,
        amount: courierEarning,
        description: "Courier delivery earning.",
      },
    ],
  };
}

export async function settleDeliveredCashOrder(input: {
  tx: Prisma.TransactionClient;
  order: SettlementOrder;
  courierId: string;
  actorUserId: string;
  paidAt: Date;
}) {
  if (input.order.paymentMethod !== "cash_to_courier") {
    throw new FinancialSettlementError(
      "unsupported_payment_method",
      input.order.publicNumber,
    );
  }

  if (!input.order.financials) {
    throw new FinancialSettlementError(
      "financial_record_missing",
      input.order.publicNumber,
    );
  }

  const payment = input.order.payments.find(
    (candidate) =>
      candidate.method === "cash_to_courier" &&
      payablePaymentStatuses.has(candidate.status),
  );

  if (!payment) {
    throw new FinancialSettlementError(
      "payment_record_missing",
      input.order.publicNumber,
    );
  }

  if (
    payment.amount !== input.order.financials.customerTotal ||
    payment.currency !== input.order.financials.currency
  ) {
    throw new FinancialSettlementError(
      "payment_amount_mismatch",
      input.order.publicNumber,
    );
  }

  const settlement = buildCashSettlementLedger(input.order.financials);

  const paymentUpdate = await input.tx.payment.updateMany({
    where: {
      id: payment.id,
      status: { in: [...payablePaymentStatuses] },
    },
    data: {
      status: "paid",
    },
  });

  if (paymentUpdate.count !== 1) {
    throw new FinancialSettlementError(
      "payment_record_missing",
      input.order.publicNumber,
    );
  }

  await input.tx.paymentTransaction.create({
    data: {
      paymentId: payment.id,
      provider: payment.provider,
      type: "payment",
      status: "paid",
      amount: payment.amount,
      currency: payment.currency,
      rawPayload: {
        source: "cash_to_courier_v1",
        paidAt: input.paidAt.toISOString(),
      },
    },
  });

  await input.tx.restaurantLedgerEntry.createMany({
    data: settlement.restaurantEntries.map((entry) => ({
      restaurantId: input.order.restaurantId,
      orderId: input.order.id,
      type: entry.type,
      amount: entry.amount,
      currency: settlement.currency,
      description: entry.description,
    })),
  });

  await input.tx.restaurantBalance.upsert({
    where: { restaurantId: input.order.restaurantId },
    create: {
      restaurantId: input.order.restaurantId,
      balance: settlement.restaurantBalanceDelta,
      currency: settlement.currency,
    },
    update: {
      balance: { increment: settlement.restaurantBalanceDelta },
    },
  });

  await input.tx.courierLedgerEntry.createMany({
    data: settlement.courierEntries.map((entry) => ({
      courierId: input.courierId,
      orderId: input.order.id,
      type: entry.type,
      amount: entry.amount,
      currency: settlement.currency,
      description: entry.description,
    })),
  });

  await input.tx.courierBalance.upsert({
    where: { courierId: input.courierId },
    create: {
      courierId: input.courierId,
      balance: settlement.courierBalanceDelta,
      currency: settlement.currency,
    },
    update: {
      balance: { increment: settlement.courierBalanceDelta },
    },
  });

  await input.tx.auditLog.create({
    data: {
      actorUserId: input.actorUserId,
      entityType: "order",
      entityId: input.order.id,
      action: "order_delivered_financially_closed_v1",
      metadata: {
        publicNumber: input.order.publicNumber,
        paymentId: payment.id,
        paymentMethod: input.order.paymentMethod,
        customerTotal: input.order.financials.customerTotal,
        restaurantBalanceDelta: settlement.restaurantBalanceDelta,
        courierBalanceDelta: settlement.courierBalanceDelta,
        paidAt: input.paidAt.toISOString(),
      },
    },
  });
}
