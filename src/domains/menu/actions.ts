"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";
import { getCurrentUser } from "@/domains/auth/session";
import { getPrisma } from "@/lib/db/prisma";

type RestaurantStaffContext = {
  restaurantId: string;
  restaurantSlug: string;
};

function readString(formData: FormData, key: string, maxLength = 500) {
  const value = formData.get(key);
  const text = typeof value === "string" ? value.trim() : "";

  if (text.length > maxLength) {
    redirect("/restaurant/menu?error=input_too_long");
  }

  return text;
}

function readRequiredString(
  formData: FormData,
  key: string,
  error: string,
  maxLength = 120,
) {
  const value = readString(formData, key, maxLength);

  if (!value) {
    redirect(`/restaurant/menu?error=${error}`);
  }

  return value;
}

function readBoolean(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

function readInteger(formData: FormData, key: string, fallback: number) {
  const rawValue = readString(formData, key, 12);
  const value = Number(rawValue);

  if (!Number.isInteger(value)) {
    return fallback;
  }

  return value;
}

function readSortOrder(formData: FormData) {
  return Math.min(Math.max(readInteger(formData, "sortOrder", 0), 0), 10_000);
}

function readPrice(formData: FormData) {
  const priceKzt = readInteger(formData, "priceKzt", 0);

  if (priceKzt < 1 || priceKzt > 1_000_000) {
    redirect("/restaurant/menu?error=invalid_price");
  }

  return priceKzt * 100;
}

async function requireRestaurantStaff(): Promise<RestaurantStaffContext> {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const staff = await getPrisma().restaurantStaff.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    select: {
      restaurantId: true,
      restaurant: {
        select: {
          slug: true,
        },
      },
    },
  });

  if (!staff?.restaurant) {
    redirect("/restaurant/menu?error=restaurant_staff_required");
  }

  return {
    restaurantId: staff.restaurantId,
    restaurantSlug: staff.restaurant.slug,
  };
}

function revalidateMenuPaths(restaurantSlug: string) {
  revalidatePath("/");
  revalidatePath("/restaurant");
  revalidatePath("/restaurant/menu");
  revalidatePath(`/restaurants/${restaurantSlug}`);
}

async function upsertCategoryTranslations(input: {
  tx: Prisma.TransactionClient;
  categoryId: string;
  nameRu: string;
  nameKk: string;
}) {
  await input.tx.menuCategoryTranslation.upsert({
    where: {
      menuCategoryId_language: {
        menuCategoryId: input.categoryId,
        language: "ru",
      },
    },
    update: {
      name: input.nameRu,
    },
    create: {
      menuCategoryId: input.categoryId,
      language: "ru",
      name: input.nameRu,
    },
  });

  await input.tx.menuCategoryTranslation.upsert({
    where: {
      menuCategoryId_language: {
        menuCategoryId: input.categoryId,
        language: "kk",
      },
    },
    update: {
      name: input.nameKk,
    },
    create: {
      menuCategoryId: input.categoryId,
      language: "kk",
      name: input.nameKk,
    },
  });
}

async function upsertItemTranslations(input: {
  tx: Prisma.TransactionClient;
  itemId: string;
  nameRu: string;
  nameKk: string;
  descriptionRu: string;
  descriptionKk: string;
}) {
  await input.tx.menuItemTranslation.upsert({
    where: {
      menuItemId_language: {
        menuItemId: input.itemId,
        language: "ru",
      },
    },
    update: {
      name: input.nameRu,
      description: input.descriptionRu || null,
    },
    create: {
      menuItemId: input.itemId,
      language: "ru",
      name: input.nameRu,
      description: input.descriptionRu || null,
    },
  });

  await input.tx.menuItemTranslation.upsert({
    where: {
      menuItemId_language: {
        menuItemId: input.itemId,
        language: "kk",
      },
    },
    update: {
      name: input.nameKk,
      description: input.descriptionKk || null,
    },
    create: {
      menuItemId: input.itemId,
      language: "kk",
      name: input.nameKk,
      description: input.descriptionKk || null,
    },
  });
}

export async function createMenuCategoryAction(formData: FormData) {
  const staff = await requireRestaurantStaff();
  const nameRu = readRequiredString(formData, "nameRu", "category_name_required");
  const nameKk = readString(formData, "nameKk", 120) || nameRu;
  const sortOrder = readSortOrder(formData);
  const prisma = getPrisma();

  await prisma.$transaction(async (tx) => {
    const category = await tx.menuCategory.create({
      data: {
        restaurantId: staff.restaurantId,
        sortOrder,
        isActive: true,
      },
      select: {
        id: true,
      },
    });

    await upsertCategoryTranslations({
      tx,
      categoryId: category.id,
      nameRu,
      nameKk,
    });
  });

  revalidateMenuPaths(staff.restaurantSlug);
  redirect("/restaurant/menu?updated=category_created");
}

export async function updateMenuCategoryAction(formData: FormData) {
  const staff = await requireRestaurantStaff();
  const categoryId = readRequiredString(
    formData,
    "categoryId",
    "category_required",
  );
  const nameRu = readRequiredString(formData, "nameRu", "category_name_required");
  const nameKk = readString(formData, "nameKk", 120) || nameRu;
  const sortOrder = readSortOrder(formData);
  const isActive = readBoolean(formData, "isActive");
  const prisma = getPrisma();

  const updated = await prisma.$transaction(async (tx) => {
    const categoryUpdate = await tx.menuCategory.updateMany({
      where: {
        id: categoryId,
        restaurantId: staff.restaurantId,
      },
      data: {
        sortOrder,
        isActive,
      },
    });

    if (categoryUpdate.count !== 1) {
      return false;
    }

    await upsertCategoryTranslations({
      tx,
      categoryId,
      nameRu,
      nameKk,
    });

    return true;
  });

  if (!updated) {
    redirect("/restaurant/menu?error=category_not_found");
  }

  revalidateMenuPaths(staff.restaurantSlug);
  redirect("/restaurant/menu?updated=category_updated");
}

export async function createMenuItemAction(formData: FormData) {
  const staff = await requireRestaurantStaff();
  const categoryId = readRequiredString(
    formData,
    "categoryId",
    "category_required",
  );
  const nameRu = readRequiredString(formData, "nameRu", "item_name_required");
  const nameKk = readString(formData, "nameKk", 120) || nameRu;
  const descriptionRu = readString(formData, "descriptionRu", 500);
  const descriptionKk = readString(formData, "descriptionKk", 500);
  const imageUrl = readString(formData, "imageUrl", 500) || null;
  const price = readPrice(formData);
  const sortOrder = readSortOrder(formData);
  const prisma = getPrisma();

  const created = await prisma.$transaction(async (tx) => {
    const category = await tx.menuCategory.findFirst({
      where: {
        id: categoryId,
        restaurantId: staff.restaurantId,
      },
      select: {
        id: true,
      },
    });

    if (!category) {
      return false;
    }

    const item = await tx.menuItem.create({
      data: {
        restaurantId: staff.restaurantId,
        menuCategoryId: category.id,
        price,
        imageUrl,
        sortOrder,
        isActive: true,
        isAvailable: true,
      },
      select: {
        id: true,
      },
    });

    await upsertItemTranslations({
      tx,
      itemId: item.id,
      nameRu,
      nameKk,
      descriptionRu,
      descriptionKk,
    });

    return true;
  });

  if (!created) {
    redirect("/restaurant/menu?error=category_not_found");
  }

  revalidateMenuPaths(staff.restaurantSlug);
  redirect("/restaurant/menu?updated=item_created");
}

export async function updateMenuItemAction(formData: FormData) {
  const staff = await requireRestaurantStaff();
  const itemId = readRequiredString(formData, "itemId", "item_required");
  const categoryId = readRequiredString(
    formData,
    "categoryId",
    "category_required",
  );
  const nameRu = readRequiredString(formData, "nameRu", "item_name_required");
  const nameKk = readString(formData, "nameKk", 120) || nameRu;
  const descriptionRu = readString(formData, "descriptionRu", 500);
  const descriptionKk = readString(formData, "descriptionKk", 500);
  const imageUrl = readString(formData, "imageUrl", 500) || null;
  const price = readPrice(formData);
  const sortOrder = readSortOrder(formData);
  const isActive = readBoolean(formData, "isActive");
  const isAvailable = readBoolean(formData, "isAvailable");
  const prisma = getPrisma();

  const updated = await prisma.$transaction(async (tx) => {
    const item = await tx.menuItem.findFirst({
      where: {
        id: itemId,
        restaurantId: staff.restaurantId,
      },
      select: {
        id: true,
      },
    });

    const category = await tx.menuCategory.findFirst({
      where: {
        id: categoryId,
        restaurantId: staff.restaurantId,
      },
      select: {
        id: true,
      },
    });

    if (!item || !category) {
      return false;
    }

    const itemUpdate = await tx.menuItem.updateMany({
      where: {
        id: item.id,
        restaurantId: staff.restaurantId,
      },
      data: {
        menuCategoryId: category.id,
        price,
        imageUrl,
        sortOrder,
        isActive,
        isAvailable,
      },
    });

    if (itemUpdate.count !== 1) {
      return false;
    }

    await upsertItemTranslations({
      tx,
      itemId: item.id,
      nameRu,
      nameKk,
      descriptionRu,
      descriptionKk,
    });

    return true;
  });

  if (!updated) {
    redirect("/restaurant/menu?error=item_not_found");
  }

  revalidateMenuPaths(staff.restaurantSlug);
  redirect("/restaurant/menu?updated=item_updated");
}
