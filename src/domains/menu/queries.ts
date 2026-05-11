import { getPrisma } from "@/lib/db/prisma";
import { formatKzt } from "@/lib/money/format";

function getTranslation<T extends { language: string; name: string }>(
  translations: T[],
  language: "ru" | "kk",
) {
  return translations.find((translation) => translation.language === language);
}

function getDescriptionTranslation<
  T extends { language: string; name: string; description?: string | null },
>(translations: T[], language: "ru" | "kk") {
  return translations.find((translation) => translation.language === language);
}

export async function getRestaurantMenuManagement(userId: string) {
  const prisma = getPrisma();

  const staff = await prisma.restaurantStaff.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
    include: {
      restaurant: {
        include: {
          translations: true,
          menuCategories: {
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
            include: {
              translations: true,
              items: {
                orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
                include: {
                  translations: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!staff) {
    return null;
  }

  if (!staff.restaurant) {
    return null;
  }

  const restaurantRu = getDescriptionTranslation(
    staff.restaurant.translations,
    "ru",
  );

  const categories = staff.restaurant.menuCategories.map((category) => {
    const ru = getTranslation(category.translations, "ru");
    const kk = getTranslation(category.translations, "kk");

    return {
      id: category.id,
      nameRu: ru?.name ?? "",
      nameKk: kk?.name ?? "",
      displayName: ru?.name ?? kk?.name ?? "Категория",
      sortOrder: category.sortOrder,
      isActive: category.isActive,
      items: category.items.map((item) => {
        const itemRu = getDescriptionTranslation(item.translations, "ru");
        const itemKk = getDescriptionTranslation(item.translations, "kk");

        return {
          id: item.id,
          categoryId: item.menuCategoryId,
          nameRu: itemRu?.name ?? "",
          nameKk: itemKk?.name ?? "",
          descriptionRu: itemRu?.description ?? "",
          descriptionKk: itemKk?.description ?? "",
          displayName: itemRu?.name ?? itemKk?.name ?? "Блюдо",
          price: item.price,
          priceKzt: Math.round(item.price / 100),
          formattedPrice: formatKzt(item.price),
          imageUrl: item.imageUrl ?? "",
          sortOrder: item.sortOrder,
          isActive: item.isActive,
          isAvailable: item.isAvailable,
        };
      }),
    };
  });

  const allItems = categories.flatMap((category) => category.items);

  return {
    restaurant: {
      id: staff.restaurant.id,
      slug: staff.restaurant.slug,
      name: restaurantRu?.name ?? staff.restaurant.slug,
      role: staff.role,
    },
    stats: {
      categories: categories.length,
      activeCategories: categories.filter((category) => category.isActive).length,
      items: allItems.length,
      unavailableItems: allItems.filter(
        (item) => !item.isActive || !item.isAvailable,
      ).length,
    },
    categories,
  };
}
