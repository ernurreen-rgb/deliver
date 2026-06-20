import { redirect } from "next/navigation";
import type { RestaurantStaffRole } from "@deliver/database/enums";
import { getPrisma } from "@deliver/database";
import { hasAnyRole, requireAnyRole } from "./authorization";

type RestaurantStaffScopeUser = {
  id: string;
  roles: Array<{ role: string }>;
} | null;

export type RestaurantStaffContext = {
  userId: string;
  restaurantId: string;
  restaurantSlug: string;
  staffRole: RestaurantStaffRole;
};

export async function getRestaurantStaffContextForUser(
  user: RestaurantStaffScopeUser,
): Promise<RestaurantStaffContext | null> {
  if (!user || !hasAnyRole(user, ["restaurant_staff", "admin"])) {
    return null;
  }

  const staff = await getPrisma().restaurantStaff.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    select: {
      restaurantId: true,
      role: true,
      restaurant: {
        select: {
          slug: true,
        },
      },
    },
  });

  if (!staff?.restaurant) {
    return null;
  }

  return {
    userId: user.id,
    restaurantId: staff.restaurantId,
    restaurantSlug: staff.restaurant.slug,
    staffRole: staff.role,
  };
}

export async function requireRestaurantStaffContext(input: {
  redirectPath:
    | "/restaurant"
    | "/restaurant/menu"
    | "/restaurant/settings";
  error?: string;
}): Promise<RestaurantStaffContext> {
  const user = await requireAnyRole(["restaurant_staff", "admin"]);
  const context = await getRestaurantStaffContextForUser(user);

  if (!context) {
    redirect(
      `${input.redirectPath}?error=${input.error ?? "restaurant_staff_required"}`,
    );
  }

  return context;
}
