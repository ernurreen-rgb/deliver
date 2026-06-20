import { getPrisma } from "@/lib/db/prisma";
import { normalizeAlmatyAddressLine } from "@/domains/geo";

export async function getAdminStats() {
  const prisma = getPrisma();

  const [restaurants, couriers, promocodes, orders] = await Promise.all([
    prisma.restaurant.count(),
    prisma.courier.count(),
    prisma.promocode.count(),
    prisma.order.count(),
  ]);

  return {
    restaurants,
    couriers,
    promocodes,
    orders,
  };
}

export async function getAdminRestaurants() {
  const restaurants = await getPrisma().restaurant.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      translations: true,
      _count: {
        select: {
          menuItems: true,
          staff: true,
        },
      },
    },
  });

  return restaurants.map((restaurant) => {
    const translation = restaurant.translations.find(
      (item) => item.language === "ru",
    );

    return {
      id: restaurant.id,
      slug: restaurant.slug,
      name: translation?.name ?? restaurant.slug,
      status: restaurant.status,
      addressLine: restaurant.addressLine,
      hasCoordinates: Boolean(restaurant.latitude && restaurant.longitude),
      deliveryRadiusMeters: restaurant.deliveryRadiusMeters,
      menuItems: restaurant._count.menuItems,
      staff: restaurant._count.staff,
    };
  });
}

export async function getAdminRestaurantLocation(restaurantId: string) {
  const restaurant = await getPrisma().restaurant.findUnique({
    where: { id: restaurantId },
    include: {
      translations: true,
    },
  });

  if (!restaurant) {
    return null;
  }

  const translation = restaurant.translations.find(
    (item) => item.language === "ru",
  );

  return {
    id: restaurant.id,
    slug: restaurant.slug,
    name: translation?.name ?? restaurant.slug,
    status: restaurant.status,
    addressLine: normalizeAlmatyAddressLine(restaurant.addressLine),
    latitude: restaurant.latitude?.toString() ?? null,
    longitude: restaurant.longitude?.toString() ?? null,
    geoProvider: restaurant.geoProvider,
    geoProviderPlaceId: restaurant.geoProviderPlaceId,
    geoSource: restaurant.geoSource,
    geocodedAt: restaurant.geocodedAt,
    deliveryRadiusMeters: restaurant.deliveryRadiusMeters,
  };
}
