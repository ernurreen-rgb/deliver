import { dispatchNextCourierOffer, expireCourierOffers } from "@/domains/delivery/dispatch";
import { getPrisma } from "@/lib/db/prisma";

const dispatchRecoverableOrderStatuses = [
  "accepted",
  "preparing",
  "ready_for_pickup",
] as const;

export const DISPATCH_TICK_DEFAULT_LIMIT = 100;

type DispatchRecoverableOrderStatus =
  (typeof dispatchRecoverableOrderStatuses)[number];

type DispatchResultStatus = Awaited<
  ReturnType<typeof dispatchNextCourierOffer>
>["status"];

export type DispatchTickSummary = {
  startedAt: string;
  finishedAt: string;
  expiredOffers: number;
  expiredDeliveries: number;
  missingDeliveryCandidates: number;
  createdDeliveries: number;
  redispatchCandidates: number;
  dispatchResults: Record<DispatchResultStatus, number>;
};

export function isDispatchRecoverableOrderStatus(
  status: string,
): status is DispatchRecoverableOrderStatus {
  return dispatchRecoverableOrderStatuses.includes(
    status as DispatchRecoverableOrderStatus,
  );
}

export function shouldRedispatchPendingDelivery(input: {
  deliveryStatus: string;
  courierId: string | null;
  orderStatus: string;
  hasActivePendingOffer: boolean;
}) {
  return (
    input.deliveryStatus === "pending_assignment" &&
    input.courierId === null &&
    isDispatchRecoverableOrderStatus(input.orderStatus) &&
    !input.hasActivePendingOffer
  );
}

function createDispatchResultCounts(): Record<DispatchResultStatus, number> {
  return {
    offer_created: 0,
    active_offer_exists: 0,
    already_assigned: 0,
    delivery_not_found: 0,
    order_not_dispatchable: 0,
    missing_restaurant_coordinates: 0,
    no_available_couriers: 0,
  };
}

export async function recoverMissingDeliveries(input: {
  now?: Date;
  limit?: number;
} = {}) {
  const prisma = getPrisma();
  const limit = input.limit ?? DISPATCH_TICK_DEFAULT_LIMIT;

  const orders = await prisma.order.findMany({
    where: {
      status: { in: [...dispatchRecoverableOrderStatuses] },
      delivery: null,
    },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: {
      id: true,
    },
  });

  if (orders.length === 0) {
    return {
      candidateCount: 0,
      createdCount: 0,
    };
  }

  const result = await prisma.delivery.createMany({
    data: orders.map((order) => ({
      orderId: order.id,
      status: "pending_assignment" as const,
    })),
    skipDuplicates: true,
  });

  return {
    candidateCount: orders.length,
    createdCount: result.count,
  };
}

async function findRedispatchCandidates(input: {
  now: Date;
  limit: number;
  excludeDeliveryIds?: string[];
}) {
  const prisma = getPrisma();

  return prisma.delivery.findMany({
    where: {
      id:
        input.excludeDeliveryIds && input.excludeDeliveryIds.length > 0
          ? { notIn: input.excludeDeliveryIds }
          : undefined,
      status: "pending_assignment",
      courierId: null,
      order: {
        status: { in: [...dispatchRecoverableOrderStatuses] },
      },
      offers: {
        none: {
          status: "pending",
          expiresAt: { gt: input.now },
        },
      },
    },
    orderBy: { createdAt: "asc" },
    take: input.limit,
    select: {
      id: true,
    },
  });
}

export async function runDispatchTick(input: {
  now?: Date;
  limit?: number;
} = {}): Promise<DispatchTickSummary> {
  const now = input.now ?? new Date();
  const limit = input.limit ?? DISPATCH_TICK_DEFAULT_LIMIT;
  const startedAt = now.toISOString();
  const dispatchResults = createDispatchResultCounts();

  const expired = await expireCourierOffers(now);
  const missingDeliveries = await recoverMissingDeliveries({ now, limit });
  const redispatchCandidates = await findRedispatchCandidates({
    now,
    limit,
    excludeDeliveryIds: expired.deliveryIds,
  });

  for (const delivery of redispatchCandidates) {
    const result = await dispatchNextCourierOffer(delivery.id, now);
    dispatchResults[result.status] += 1;
  }

  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    expiredOffers: expired.expiredCount,
    expiredDeliveries: expired.deliveryCount,
    missingDeliveryCandidates: missingDeliveries.candidateCount,
    createdDeliveries: missingDeliveries.createdCount,
    redispatchCandidates: redispatchCandidates.length,
    dispatchResults,
  };
}
