import { getPrisma } from "@/lib/db/prisma";
import { formatKzt } from "@/lib/money/format";

export async function getStorefrontRestaurants() {
  const prisma = getPrisma();

  const restaurants = await prisma.restaurant.findMany({
    where: { status: "active" },
    orderBy: { createdAt: "asc" },
    include: {
      translations: true,
      categoryLinks: {
        include: {
          category: {
            include: {
              translations: true,
            },
          },
        },
      },
    },
  });

  return restaurants.map((restaurant) => {
    const ru = restaurant.translations.find(
      (translation) => translation.language === "ru",
    );
    const category = restaurant.categoryLinks[0]?.category.translations.find(
      (translation) => translation.language === "ru",
    );

    return {
      id: restaurant.id,
      slug: restaurant.slug,
      name: ru?.name ?? restaurant.slug,
      category: category?.name ?? "Ресторан",
      eta: "30-45 мин",
      distance: restaurant.deliveryRadiusMeters
        ? `до ${Math.round(restaurant.deliveryRadiusMeters / 1000)} км`
        : "радиус не задан",
      rating: "Новый",
      deliveryFee: "по расстоянию",
      minimumOrder: formatKzt(restaurant.minimumOrderAmount),
    };
  });
}

export async function getRestaurantMenu(slug: string) {
  const prisma = getPrisma();

  const restaurant = await prisma.restaurant.findFirst({
    where: { slug, status: "active" },
    include: {
      translations: true,
      menuCategories: {
        orderBy: { sortOrder: "asc" },
        include: {
          translations: true,
          items: {
            where: {
              isActive: true,
            },
            orderBy: { sortOrder: "asc" },
            include: {
              translations: true,
            },
          },
        },
      },
    },
  });

  if (!restaurant) {
    return null;
  }

  const restaurantRu = restaurant.translations.find(
    (translation) => translation.language === "ru",
  );

  return {
    id: restaurant.id,
    slug: restaurant.slug,
    name: restaurantRu?.name ?? restaurant.slug,
    description: restaurantRu?.description,
    minimumOrder: formatKzt(restaurant.minimumOrderAmount),
    deliveryRadius: restaurant.deliveryRadiusMeters
      ? `${Math.round(restaurant.deliveryRadiusMeters / 1000)} км`
      : "не задан",
    categories: restaurant.menuCategories.map((category) => {
      const categoryRu = category.translations.find(
        (translation) => translation.language === "ru",
      );

      return {
        id: category.id,
        name: categoryRu?.name ?? "Меню",
        items: category.items.map((item) => {
          const itemRu = item.translations.find(
            (translation) => translation.language === "ru",
          );

          return {
            id: item.id,
            name: itemRu?.name ?? "Блюдо",
            description: itemRu?.description,
            price: item.price,
            formattedPrice: formatKzt(item.price),
            currency: "KZT" as const,
            isAvailable: item.isAvailable,
          };
        }),
      };
    }),
  };
}
