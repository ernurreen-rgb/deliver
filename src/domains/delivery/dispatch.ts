import { Prisma } from "@/generated/prisma/client";
import { calculateDistanceMeters, toNumber } from "@/domains/delivery/pricing";
import { getPrisma } from "@/lib/db/prisma";

export const COURIER_OFFER_TIMEOUT_MS = 60_000;

const activeDeliveryStatuses = ["assigned", "picked_up", "delivering"] as const;

const dispatchableOrderStatuses = [
  "accepted",
  "preparing",
  "ready_for_pickup",
] as const;

type DispatchableOrderStatus = (typeof dispatchableOrderStatuses)[number];

class CourierUnavailableError extends Error {
  constructor(
    readonly deliveryId: string,
    readonly publicNumber: string,
  ) {
    super("Courier is no longer available.");
  }
}

class OfferUnavailableError extends Error {
  constructor(
    readonly deliveryId: string,
    readonly publicNumber: string,
  ) {
    super("Offer is no longer available.");
  }
}

export type DispatchOfferResult =
  | { status: "offer_created"; offerId: string; courierId: string }
  | { status: "active_offer_exists"; offerId: string; courierId: string }
  | { status: "already_assigned" }
  | { status: "delivery_not_found" }
  | { status: "order_not_dispatchable" }
  | { status: "missing_restaurant_coordinates" }
  | { status: "no_available_couriers" };

function addOfferTimeout(now: Date) {
  return new Date(now.getTime() + COURIER_OFFER_TIMEOUT_MS);
}

async function expireDeliveryOffers(deliveryId: string, now: Date) {
  const prisma = getPrisma();

  return prisma.courierOffer.updateMany({
    where: {
      deliveryId,
      status: "pending",
      expiresAt: { lte: now },
    },
    data: {
      status: "expired",
      respondedAt: now,
    },
  });
}

function isDispatchableOrderStatus(
  status: string,
): status is DispatchableOrderStatus {
  return dispatchableOrderStatuses.includes(status as DispatchableOrderStatus);
}

export async function dispatchNextCourierOffer(
  deliveryId: string,
  now = new Date(),
): Promise<DispatchOfferResult> {
  const prisma = getPrisma();

  await expireDeliveryOffers(deliveryId, now);

  const delivery = await prisma.delivery.findUnique({
    where: { id: deliveryId },
    include: {
      offers: {
        orderBy: { sequence: "asc" },
        select: {
          id: true,
          courierId: true,
          expiresAt: true,
          sequence: true,
          status: true,
        },
      },
      order: {
        include: {
          restaurant: true,
        },
      },
    },
  });

  if (!delivery) {
    return { status: "delivery_not_found" };
  }

  if (delivery.courierId || delivery.status !== "pending_assignment") {
    return { status: "already_assigned" };
  }

  if (!isDispatchableOrderStatus(delivery.order.status)) {
    return { status: "order_not_dispatchable" };
  }

  const activeOffer = delivery.offers.find(
    (offer) => offer.status === "pending" && offer.expiresAt > now,
  );

  if (activeOffer) {
    return {
      status: "active_offer_exists",
      offerId: activeOffer.id,
      courierId: activeOffer.courierId,
    };
  }

  const restaurantLatitude = toNumber(delivery.order.restaurant.latitude);
  const restaurantLongitude = toNumber(delivery.order.restaurant.longitude);

  if (restaurantLatitude === null || restaurantLongitude === null) {
    return { status: "missing_restaurant_coordinates" };
  }

  const excludedCourierIds = new Set(delivery.offers.map((offer) => offer.courierId));
  const availableCouriers = await prisma.courier.findMany({
    where: {
      id: {
        notIn: Array.from(excludedCourierIds),
      },
      status: "available",
      deliveries: {
        none: {
          status: { in: [...activeDeliveryStatuses] },
        },
      },
      availability: {
        is: {
          status: "available",
          latitude: { not: null },
          longitude: { not: null },
        },
      },
    },
    include: {
      availability: true,
    },
  });

  const rankedCouriers = availableCouriers
    .map((courier) => {
      const courierLatitude = toNumber(courier.availability?.latitude);
      const courierLongitude = toNumber(courier.availability?.longitude);

      if (courierLatitude === null || courierLongitude === null) {
        return null;
      }

      return {
        courierId: courier.id,
        distanceMeters: calculateDistanceMeters(
          { latitude: courierLatitude, longitude: courierLongitude },
          { latitude: restaurantLatitude, longitude: restaurantLongitude },
        ),
      };
    })
    .filter((courier): courier is { courierId: string; distanceMeters: number } =>
      Boolean(courier),
    )
    .sort((left, right) => left.distanceMeters - right.distanceMeters);

  const nextCourier = rankedCouriers[0];

  if (!nextCourier) {
    return { status: "no_available_couriers" };
  }

  const nextSequence =
    Math.max(0, ...delivery.offers.map((offer) => offer.sequence)) + 1;

  try {
    const offer = await prisma.courierOffer.create({
      data: {
        deliveryId,
        courierId: nextCourier.courierId,
        sequence: nextSequence,
        expiresAt: addOfferTimeout(now),
      },
    });

    return {
      status: "offer_created",
      offerId: offer.id,
      courierId: offer.courierId,
    };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const existingOffer = await prisma.courierOffer.findFirst({
        where: {
          deliveryId,
          status: "pending",
          expiresAt: { gt: now },
        },
        select: {
          id: true,
          courierId: true,
        },
      });

      if (existingOffer) {
        return {
          status: "active_offer_exists",
          offerId: existingOffer.id,
          courierId: existingOffer.courierId,
        };
      }
    }

    throw error;
  }
}

export async function expireCourierOffers(now = new Date()) {
  const prisma = getPrisma();
  const expiredOffers = await prisma.courierOffer.findMany({
    where: {
      status: "pending",
      expiresAt: { lte: now },
    },
    distinct: ["deliveryId"],
    select: {
      deliveryId: true,
    },
  });

  const updateResult = await prisma.courierOffer.updateMany({
    where: {
      status: "pending",
      expiresAt: { lte: now },
    },
    data: {
      status: "expired",
      respondedAt: now,
    },
  });

  for (const offer of expiredOffers) {
    await dispatchNextCourierOffer(offer.deliveryId, now);
  }

  return {
    expiredCount: updateResult.count,
    deliveryCount: expiredOffers.length,
  };
}

export async function acceptCourierOfferForUser(input: {
  offerId: string;
  userId: string;
}) {
  const prisma = getPrisma();
  const now = new Date();

  const courier = await prisma.courier.findUnique({
    where: { userId: input.userId },
    select: { id: true },
  });

  if (!courier) {
    return { status: "courier_not_found" as const };
  }

  try {
    const accepted = await prisma.$transaction(async (tx) => {
      const offer = await tx.courierOffer.findFirst({
        where: {
          id: input.offerId,
          courierId: courier.id,
        },
        include: {
          delivery: {
            include: {
              order: {
                select: {
                  id: true,
                  publicNumber: true,
                  status: true,
                },
              },
            },
          },
        },
      });

      if (!offer) {
        return { status: "offer_not_found" as const };
      }

      if (offer.status !== "pending") {
        return {
          status: "offer_unavailable" as const,
          publicNumber: offer.delivery.order.publicNumber,
        };
      }

      if (offer.expiresAt <= now) {
        await tx.courierOffer.updateMany({
          where: {
            id: offer.id,
            status: "pending",
          },
          data: {
            status: "expired",
            respondedAt: now,
          },
        });

        return {
          status: "offer_expired" as const,
          deliveryId: offer.deliveryId,
          publicNumber: offer.delivery.order.publicNumber,
        };
      }

      if (!isDispatchableOrderStatus(offer.delivery.order.status)) {
        throw new OfferUnavailableError(
          offer.deliveryId,
          offer.delivery.order.publicNumber,
        );
      }

      const activeDeliveryCount = await tx.delivery.count({
        where: {
          courierId: courier.id,
          status: { in: [...activeDeliveryStatuses] },
        },
      });

      if (activeDeliveryCount > 0) {
        throw new CourierUnavailableError(
          offer.deliveryId,
          offer.delivery.order.publicNumber,
        );
      }

      const courierUpdate = await tx.courier.updateMany({
        where: {
          id: courier.id,
          status: "available",
        },
        data: {
          status: "busy",
        },
      });

      if (courierUpdate.count !== 1) {
        throw new CourierUnavailableError(
          offer.deliveryId,
          offer.delivery.order.publicNumber,
        );
      }

      const availabilityUpdate = await tx.courierAvailability.updateMany({
        where: {
          courierId: courier.id,
          status: "available",
        },
        data: {
          status: "busy",
        },
      });

      if (availabilityUpdate.count !== 1) {
        throw new CourierUnavailableError(
          offer.deliveryId,
          offer.delivery.order.publicNumber,
        );
      }

      const offerUpdate = await tx.courierOffer.updateMany({
        where: {
          id: offer.id,
          courierId: courier.id,
          status: "pending",
          expiresAt: { gt: now },
        },
        data: {
          status: "accepted",
          respondedAt: now,
        },
      });

      if (offerUpdate.count !== 1) {
        throw new OfferUnavailableError(
          offer.deliveryId,
          offer.delivery.order.publicNumber,
        );
      }

      const deliveryUpdate = await tx.delivery.updateMany({
        where: {
          id: offer.deliveryId,
          courierId: null,
          status: "pending_assignment",
        },
        data: {
          courierId: courier.id,
          status: "assigned",
          assignedByUserId: input.userId,
          assignedAt: now,
        },
      });

      if (deliveryUpdate.count !== 1) {
        throw new OfferUnavailableError(
          offer.deliveryId,
          offer.delivery.order.publicNumber,
        );
      }

      const nextOrderStatus =
        offer.delivery.order.status === "ready_for_pickup"
          ? "ready_for_pickup"
          : "courier_assigned";

      const orderUpdate = await tx.order.updateMany({
        where: {
          id: offer.delivery.orderId,
          status: { in: [...dispatchableOrderStatuses] },
        },
        data: {
          status: nextOrderStatus,
        },
      });

      if (orderUpdate.count !== 1) {
        throw new OfferUnavailableError(
          offer.deliveryId,
          offer.delivery.order.publicNumber,
        );
      }

      await tx.orderStatusHistory.create({
        data: {
          orderId: offer.delivery.orderId,
          fromStatus: offer.delivery.order.status,
          toStatus: nextOrderStatus,
          changedByUserId: input.userId,
          comment: "Courier accepted delivery offer.",
        },
      });

      await tx.courierOffer.updateMany({
        where: {
          deliveryId: offer.deliveryId,
          id: { not: offer.id },
          status: "pending",
        },
        data: {
          status: "cancelled",
          respondedAt: now,
        },
      });

      const supersededCourierOffers = await tx.courierOffer.findMany({
        where: {
          courierId: courier.id,
          deliveryId: { not: offer.deliveryId },
          status: "pending",
        },
        select: {
          deliveryId: true,
        },
      });

      await tx.courierOffer.updateMany({
        where: {
          courierId: courier.id,
          deliveryId: { not: offer.deliveryId },
          status: "pending",
        },
        data: {
          status: "cancelled",
          respondedAt: now,
        },
      });

      return {
        status: "accepted" as const,
        publicNumber: offer.delivery.order.publicNumber,
        redispatchDeliveryIds: [
          ...new Set(
            supersededCourierOffers.map((otherOffer) => otherOffer.deliveryId),
          ),
        ],
      };
    });

    if (accepted.status === "offer_expired") {
      await dispatchNextCourierOffer(accepted.deliveryId, now);
    }

    if (accepted.status === "accepted") {
      for (const deliveryId of accepted.redispatchDeliveryIds) {
        await dispatchNextCourierOffer(deliveryId, now);
      }
    }

    return accepted;
  } catch (error) {
    if (error instanceof CourierUnavailableError) {
      await prisma.courierOffer.updateMany({
        where: {
          id: input.offerId,
          courierId: courier.id,
          status: "pending",
        },
        data: {
          status: "cancelled",
          respondedAt: now,
        },
      });

      await dispatchNextCourierOffer(error.deliveryId, now);

      return {
        status: "courier_unavailable" as const,
        publicNumber: error.publicNumber,
      };
    }

    if (error instanceof OfferUnavailableError) {
      await prisma.courierOffer.updateMany({
        where: {
          id: input.offerId,
          courierId: courier.id,
          status: "pending",
        },
        data: {
          status: "cancelled",
          respondedAt: now,
        },
      });

      await dispatchNextCourierOffer(error.deliveryId, now);

      return {
        status: "offer_unavailable" as const,
        publicNumber: error.publicNumber,
      };
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const offer = await prisma.courierOffer.findFirst({
        where: {
          id: input.offerId,
          courierId: courier.id,
        },
        include: {
          delivery: {
            include: {
              order: {
                select: {
                  publicNumber: true,
                },
              },
            },
          },
        },
      });

      if (offer) {
        await prisma.courierOffer.updateMany({
          where: {
            id: offer.id,
            courierId: courier.id,
            status: "pending",
          },
          data: {
            status: "cancelled",
            respondedAt: now,
          },
        });

        await dispatchNextCourierOffer(offer.deliveryId, now);

        return {
          status: "courier_unavailable" as const,
          publicNumber: offer.delivery.order.publicNumber,
        };
      }
    }

    throw error;
  }
}

export async function rejectCourierOfferForUser(input: {
  offerId: string;
  userId: string;
}) {
  const prisma = getPrisma();
  const now = new Date();

  const courier = await prisma.courier.findUnique({
    where: { userId: input.userId },
    select: { id: true },
  });

  if (!courier) {
    return { status: "courier_not_found" as const };
  }

  const offer = await prisma.courierOffer.findFirst({
    where: {
      id: input.offerId,
      courierId: courier.id,
    },
    select: {
      deliveryId: true,
      expiresAt: true,
      status: true,
    },
  });

  if (!offer) {
    return { status: "offer_not_found" as const };
  }

  if (offer.status !== "pending") {
    return { status: "offer_unavailable" as const };
  }

  const nextStatus = offer.expiresAt <= now ? "expired" : "rejected";

  const update = await prisma.courierOffer.updateMany({
    where: {
      id: input.offerId,
      courierId: courier.id,
      status: "pending",
    },
    data: {
      status: nextStatus,
      respondedAt: now,
    },
  });

  if (update.count !== 1) {
    return { status: "offer_unavailable" as const };
  }

  await dispatchNextCourierOffer(offer.deliveryId, now);

  return { status: nextStatus as "expired" | "rejected" };
}
