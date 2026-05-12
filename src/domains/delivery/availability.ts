import { dispatchNextCourierOffer } from "@/domains/delivery/dispatch";
import { getPrisma } from "@/lib/db/prisma";

const activeDeliveryStatuses = ["assigned", "picked_up", "delivering"] as const;

export type CourierAvailabilityResult =
  | { status: "updated" }
  | { status: "courier_not_found" }
  | { status: "courier_location_required" }
  | { status: "active_delivery_exists" }
  | { status: "invalid_courier_status" };

export async function setCourierOnlineForUser(
  userId: string,
): Promise<CourierAvailabilityResult> {
  const prisma = getPrisma();
  const allowedCurrentStatuses = ["inactive", "available"] as const;

  const courier = await prisma.courier.findUnique({
    where: { userId },
    include: {
      availability: true,
      deliveries: {
        where: {
          status: { in: [...activeDeliveryStatuses] },
        },
        select: { id: true },
      },
    },
  });

  if (!courier) {
    return { status: "courier_not_found" };
  }

  if (courier.status === "busy" || courier.deliveries.length > 0) {
    return { status: "active_delivery_exists" };
  }

  if (courier.status !== "inactive" && courier.status !== "available") {
    return { status: "invalid_courier_status" };
  }

  if (!courier.availability?.latitude || !courier.availability.longitude) {
    return { status: "courier_location_required" };
  }

  const updated = await prisma.$transaction(async (tx) => {
    const courierUpdate = await tx.courier.updateMany({
      where: {
        id: courier.id,
        status: { in: [...allowedCurrentStatuses] },
        deliveries: {
          none: {
            status: { in: [...activeDeliveryStatuses] },
          },
        },
      },
      data: { status: "available" },
    });

    if (courierUpdate.count !== 1) {
      return false;
    }

    await tx.courierAvailability.updateMany({
      where: { courierId: courier.id },
      data: { status: "available" },
    });

    return true;
  });

  if (!updated) {
    return { status: "active_delivery_exists" };
  }

  return { status: "updated" };
}

export async function setCourierOfflineForUser(
  userId: string,
): Promise<CourierAvailabilityResult> {
  const prisma = getPrisma();
  const allowedCurrentStatuses = ["available", "inactive"] as const;

  const courier = await prisma.courier.findUnique({
    where: { userId },
    include: {
      deliveries: {
        where: {
          status: { in: [...activeDeliveryStatuses] },
        },
        select: { id: true },
      },
      offers: {
        where: { status: "pending" },
        select: { deliveryId: true },
      },
    },
  });

  if (!courier) {
    return { status: "courier_not_found" };
  }

  if (courier.status === "busy" || courier.deliveries.length > 0) {
    return { status: "active_delivery_exists" };
  }

  if (courier.status !== "available" && courier.status !== "inactive") {
    return { status: "invalid_courier_status" };
  }

  const deliveryIds = [...new Set(courier.offers.map((offer) => offer.deliveryId))];
  const now = new Date();

  const updated = await prisma.$transaction(async (tx) => {
    const courierUpdate = await tx.courier.updateMany({
      where: {
        id: courier.id,
        status: { in: [...allowedCurrentStatuses] },
        deliveries: {
          none: {
            status: { in: [...activeDeliveryStatuses] },
          },
        },
      },
      data: { status: "inactive" },
    });

    if (courierUpdate.count !== 1) {
      return false;
    }

    await tx.courierAvailability.updateMany({
      where: { courierId: courier.id },
      data: { status: "inactive" },
    });

    await tx.courierOffer.updateMany({
      where: {
        courierId: courier.id,
        status: "pending",
      },
      data: {
        status: "cancelled",
        respondedAt: now,
      },
    });

    return true;
  });

  if (!updated) {
    return { status: "active_delivery_exists" };
  }

  for (const deliveryId of deliveryIds) {
    await dispatchNextCourierOffer(deliveryId);
  }

  return { status: "updated" };
}
