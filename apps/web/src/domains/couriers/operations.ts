import type { CourierStatus, TransportType } from "@/generated/prisma/enums";
import { toNumber } from "@/domains/delivery/pricing";
import { getPrisma } from "@/lib/db/prisma";

const activeDeliveryStatuses = ["assigned", "picked_up", "delivering"] as const;

export const operatorSettableCourierStatuses = [
  "inactive",
  "available",
  "suspended",
] as const satisfies readonly CourierStatus[];

export const transportTypes = [
  "walking",
  "bicycle",
  "scooter",
  "car",
] as const satisfies readonly TransportType[];

export type CourierStatusChangeCheck =
  | "ok"
  | "active_delivery_exists"
  | "courier_location_required"
  | "invalid_courier_status";

export function isOperatorSettableCourierStatus(
  status: string,
): status is (typeof operatorSettableCourierStatuses)[number] {
  return operatorSettableCourierStatuses.includes(
    status as (typeof operatorSettableCourierStatuses)[number],
  );
}

export function isTransportType(
  value: string,
): value is (typeof transportTypes)[number] {
  return transportTypes.includes(value as (typeof transportTypes)[number]);
}

export function canSetCourierStatus(input: {
  targetStatus: string;
  activeDeliveryCount: number;
  hasLocation: boolean;
}): CourierStatusChangeCheck {
  if (!isOperatorSettableCourierStatus(input.targetStatus)) {
    return "invalid_courier_status";
  }

  if (input.activeDeliveryCount > 0) {
    return "active_delivery_exists";
  }

  if (input.targetStatus === "available" && !input.hasLocation) {
    return "courier_location_required";
  }

  return "ok";
}

function getCourierStatusLabel(status: string) {
  const labels: Record<string, string> = {
    inactive: "Вне линии",
    available: "На линии",
    busy: "На заказе",
    suspended: "Заблокирован",
  };

  return labels[status] ?? status;
}

function getTransportLabel(type: string | null) {
  const labels: Record<string, string> = {
    walking: "Пешком",
    bicycle: "Велосипед",
    scooter: "Самокат",
    car: "Авто",
  };

  return type ? (labels[type] ?? type) : "Не указан";
}

function getOfferStatusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: "Ожидает",
    accepted: "Принят",
    rejected: "Отказ",
    expired: "Пропущен",
    cancelled: "Отменен",
  };

  return labels[status] ?? status;
}

function getDeliveryStatusLabel(status: string) {
  const labels: Record<string, string> = {
    assigned: "Назначен",
    picked_up: "Забрал",
    delivering: "В пути",
  };

  return labels[status] ?? status;
}

export async function getCourierOperationsDashboard() {
  const prisma = getPrisma();

  const couriers = await prisma.courier.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      user: {
        select: {
          phone: true,
          status: true,
        },
      },
      profile: true,
      availability: true,
      balance: true,
      deliveries: {
        where: {
          status: { in: [...activeDeliveryStatuses] },
        },
        orderBy: { assignedAt: "desc" },
        include: {
          order: {
            include: {
              financials: true,
              restaurant: {
                include: {
                  translations: true,
                },
              },
            },
          },
        },
      },
      offers: {
        where: {
          status: { in: ["rejected", "expired", "cancelled"] },
        },
        orderBy: [{ respondedAt: "desc" }, { offeredAt: "desc" }],
        take: 6,
        include: {
          delivery: {
            include: {
              order: {
                include: {
                  restaurant: {
                    include: {
                      translations: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  const stats = {
    total: couriers.length,
    available: couriers.filter((courier) => courier.status === "available").length,
    busy: couriers.filter((courier) => courier.status === "busy").length,
    suspended: couriers.filter((courier) => courier.status === "suspended").length,
  };

  return {
    stats,
    couriers: couriers.map((courier) => {
      const latitude = toNumber(courier.availability?.latitude);
      const longitude = toNumber(courier.availability?.longitude);
      const activeDeliveryCount = courier.deliveries.length;
      const hasLocation = latitude !== null && longitude !== null;

      return {
        id: courier.id,
        userPhone: courier.user.phone,
        userStatus: courier.user.status,
        type: courier.type,
        status: courier.status,
        statusLabel: getCourierStatusLabel(courier.status),
        canChangeStatus: activeDeliveryCount === 0,
        profile: {
          fullName: courier.profile?.fullName ?? "",
          phone: courier.profile?.phone ?? courier.user.phone,
          transportType: courier.profile?.transportType ?? "walking",
          transportLabel: getTransportLabel(courier.profile?.transportType ?? null),
          documentNumber: courier.profile?.documentNumber ?? "",
        },
        availability: {
          status: courier.availability?.status ?? "inactive",
          statusLabel: getCourierStatusLabel(
            courier.availability?.status ?? "inactive",
          ),
          latitude,
          longitude,
          hasLocation,
          updatedAt: courier.availability?.updatedAt ?? null,
        },
        balance: {
          amount: courier.balance?.balance ?? 0,
          currency: courier.balance?.currency ?? "KZT",
        },
        activeDeliveryCount,
        activeDeliveries: courier.deliveries.map((delivery) => {
          const restaurantRu = delivery.order.restaurant.translations.find(
            (translation) => translation.language === "ru",
          );

          return {
            id: delivery.id,
            status: delivery.status,
            statusLabel: getDeliveryStatusLabel(delivery.status),
            assignedAt: delivery.assignedAt,
            orderNumber: delivery.order.publicNumber,
            orderStatus: delivery.order.status,
            restaurant: restaurantRu?.name ?? delivery.order.restaurant.slug,
            total: delivery.order.financials?.customerTotal ?? null,
          };
        }),
        refusalHistory: courier.offers.map((offer) => {
          const restaurantRu =
            offer.delivery.order.restaurant.translations.find(
              (translation) => translation.language === "ru",
            );

          return {
            id: offer.id,
            status: offer.status,
            statusLabel: getOfferStatusLabel(offer.status),
            offeredAt: offer.offeredAt,
            respondedAt: offer.respondedAt,
            orderNumber: offer.delivery.order.publicNumber,
            restaurant: restaurantRu?.name ?? offer.delivery.order.restaurant.slug,
          };
        }),
      };
    }),
  };
}
