"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRestaurantStaffContext } from "@/domains/auth/restaurant-staff-context";
import {
  parseRestaurantWorkingHours,
  saveRestaurantWorkingHours,
} from "@/domains/restaurants/working-hours";

export async function updateRestaurantWorkingHoursAction(formData: FormData) {
  const context = await requireRestaurantStaffContext({
    redirectPath: "/restaurant/settings",
  });
  const parsed = parseRestaurantWorkingHours(formData);

  if (!parsed.ok) {
    redirect(`/restaurant/settings?error=${parsed.error}`);
  }

  await saveRestaurantWorkingHours({
    context,
    hours: parsed.value,
  });

  revalidatePath("/");
  revalidatePath("/restaurant");
  revalidatePath("/restaurant/settings");
  revalidatePath(`/restaurants/${context.restaurantSlug}`);
  redirect("/restaurant/settings?updated=working_hours");
}
