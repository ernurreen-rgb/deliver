import type { CourierDashboardResponse } from "@deliver/contracts/courier";
import { getPrisma } from "@/lib/db/prisma";

function formatDeliveryAddress(
  address: {
    city: string;
    addressLine: string;
    apartment: string | null;
    entrance: string | null;
    floor: string | null;
  } | null,
) {
  if (!address) return "Адрес не указан";

  return [
    `${address.city}, ${address.addressLine}`,
    address.apartment && `кв. ${address.apartment}`,
    address.entrance && `подъезд ${address.entrance}`,
    address.floor && `этаж ${address.floor}`,
  ]
    .filter(Boolean)
    .join(", ");
}

export async function getCourierMobileDashboard(
  userId: string,
  now = new Date(),
): Promise<CourierDashboardResponse | null> {
  const courier = await getPrisma().courier.findUnique({
    where: { userId },
    include: {
      user: {
        select: { phone: true },
      },
      availability: true,
      balance: true,
      profile: true,
      offers: {
        where: {
          status: "pending",
          expiresAt: { gt: now },
        },
        orderBy: { offeredAt: "asc" },
        include: {
          delivery: {
            include: {
              order: {
                include: {
                  customer: {
                    select: { name: true, phone: true },
                  },
                  deliveryAddress: true,
                  financials: true,
                  items: true,
                  restaurant: {
                    include: { translations: true },
                  },
                },
              },
            },
          },
        },
      },
      deliveries: {
        where: {
          status: { in: ["assigned", "picked_up", "delivering"] },
        },
        orderBy: { assignedAt: "desc" },
        include: {
          order: {
            include: {
              customer: {
                select: { name: true, phone: true },
              },
              deliveryAddress: true,
              financials: true,
              items: true,
              restaurant: {
                include: { translations: true },
              },
            },
          },
        },
      },
    },
  });

  if (!courier) return null;

  return {
    courier: {
      status: courier.status,
      availabilityStatus: courier.availability?.status ?? "inactive",
      hasLocation: Boolean(
        courier.availability?.latitude && courier.availability.longitude,
      ),
      fullName: courier.profile?.fullName ?? "Курьер",
      phone: courier.profile?.phone ?? courier.user.phone,
      transportType: courier.profile?.transportType ?? null,
      balance: courier.balance?.balance ?? 0,
      currency: "KZT",
    },
    stats: {
      pendingOffers: courier.offers.length,
      assignedDeliveries: courier.deliveries.length,
    },
    offers: courier.offers.map((offer) => {
      const order = offer.delivery.order;
      const restaurantTranslation = order.restaurant.translations.find(
        (translation) => translation.language === "ru",
      );

      return {
        id: offer.id,
        sequence: offer.sequence,
        offeredAt: offer.offeredAt.toISOString(),
        expiresAt: offer.expiresAt.toISOString(),
        orderNumber: order.publicNumber,
        restaurantName: restaurantTranslation?.name ?? order.restaurant.slug,
        restaurantAddress:
          order.restaurant.addressLine ?? "Адрес ресторана не указан",
        deliveryAddress: formatDeliveryAddress(order.deliveryAddress),
        customerName: order.customer.name ?? order.customer.phone,
        customerPhone: order.customer.phone,
        customerTotal: order.financials?.customerTotal ?? null,
        deliveryFee: order.financials?.deliveryFee ?? null,
        itemsCount: order.items.reduce(
          (total, item) => total + item.quantity,
          0,
        ),
        currency: "KZT" as const,
      };
    }),
    deliveries: courier.deliveries.map((delivery) => {
      const order = delivery.order;
      const restaurantTranslation = order.restaurant.translations.find(
        (translation) => translation.language === "ru",
      );

      return {
        id: delivery.id,
        status: delivery.status,
        orderStatus: order.status,
        assignedAt: delivery.assignedAt?.toISOString() ?? null,
        pickedUpAt: delivery.pickedUpAt?.toISOString() ?? null,
        updatedAt: delivery.updatedAt.toISOString(),
        orderNumber: order.publicNumber,
        restaurantName: restaurantTranslation?.name ?? order.restaurant.slug,
        restaurantAddress:
          order.restaurant.addressLine ?? "Адрес ресторана не указан",
        deliveryAddress: formatDeliveryAddress(order.deliveryAddress),
        customerName: order.customer.name ?? order.customer.phone,
        customerPhone: order.customer.phone,
        customerTotal: order.financials?.customerTotal ?? null,
        itemsCount: order.items.reduce(
          (total, item) => total + item.quantity,
          0,
        ),
        currency: "KZT" as const,
      };
    }),
    refreshedAt: now.toISOString(),
  };
}
