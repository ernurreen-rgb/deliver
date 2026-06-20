import type {
  MenuCategory,
  MenuItem,
  RestaurantMenu,
  RestaurantSummary,
} from "@deliver/contracts/catalog";
import { isMenuDemoImagePath } from "@/domains/menu/image-url";
import { getRestaurantCoverImageUrl } from "@/domains/restaurants/media";
import { getPrisma } from "@/lib/db/prisma";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getRussianTranslation<T extends { language: string }>(
  translations: T[],
) {
  return translations.find((translation) => translation.language === "ru");
}

function toRestaurantSummary(input: {
  id: string;
  slug: string;
  status: string;
  minimumOrderAmount: number;
  translations: {
    language: string;
    name: string;
    description: string | null;
  }[];
}): RestaurantSummary {
  const ru = getRussianTranslation(input.translations);

  return {
    id: input.id,
    slug: input.slug,
    name: ru?.name ?? input.slug,
    description: ru?.description ?? null,
    coverImageUrl: getRestaurantCoverImageUrl(input.slug),
    deliveryTimeMinutes: null,
    minimumOrder: input.minimumOrderAmount,
    currency: "KZT",
    isOpen: input.status === "active",
  };
}

export async function getApiRestaurants() {
  const restaurants = await getPrisma().restaurant.findMany({
    where: { status: "active" },
    orderBy: { createdAt: "asc" },
    include: {
      translations: true,
    },
  });

  return restaurants.map(toRestaurantSummary);
}

export async function getApiRestaurantMenu(restaurantIdOrSlug: string) {
  const restaurant = await getPrisma().restaurant.findFirst({
    where: {
      status: "active",
      ...(uuidPattern.test(restaurantIdOrSlug)
        ? { OR: [{ id: restaurantIdOrSlug }, { slug: restaurantIdOrSlug }] }
        : { slug: restaurantIdOrSlug }),
    },
    include: {
      translations: true,
      menuCategories: {
        where: {
          isActive: true,
        },
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

  const categories: MenuCategory[] = restaurant.menuCategories.map((category) => {
    const categoryRu = getRussianTranslation(category.translations);
    const items: MenuItem[] = category.items.map((item) => {
      const itemRu = getRussianTranslation(item.translations);

      return {
        id: item.id,
        categoryId: category.id,
        name: itemRu?.name ?? "Блюдо",
        description: itemRu?.description ?? null,
        imageUrl:
          item.imageUrl && isMenuDemoImagePath(item.imageUrl)
            ? item.imageUrl
            : null,
        price: item.price,
        currency: "KZT",
        isAvailable: item.isAvailable,
      };
    });

    return {
      id: category.id,
      name: categoryRu?.name ?? "Меню",
      sortOrder: category.sortOrder,
      items,
    };
  });

  return {
    restaurant: toRestaurantSummary(restaurant),
    categories,
  } satisfies RestaurantMenu;
}
