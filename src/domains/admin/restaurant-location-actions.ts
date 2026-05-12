"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAnyRole } from "@/domains/auth/authorization";
import { parseSubmittedGeoAddress } from "@/domains/geo";
import { getPrisma } from "@/lib/db/prisma";

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function readDeliveryRadiusMeters(formData: FormData) {
  const rawValue = Number(readString(formData, "deliveryRadiusKm"));

  if (!Number.isFinite(rawValue) || rawValue <= 0 || rawValue > 80) {
    redirect("/admin/restaurants?error=invalid_radius");
  }

  return Math.round(rawValue * 1000);
}

export async function updateRestaurantLocationAction(formData: FormData) {
  await requireAnyRole(["admin"]);

  const restaurantId = readString(formData, "restaurantId");

  if (!restaurantId) {
    redirect("/admin/restaurants?error=restaurant_required");
  }

  const geoAddress = parseSubmittedGeoAddress({
    city: readString(formData, "city"),
    addressLine: readString(formData, "addressLine"),
    latitude: readString(formData, "latitude"),
    longitude: readString(formData, "longitude"),
    geoProvider: readString(formData, "geoProvider"),
    geoProviderPlaceId: readString(formData, "geoProviderPlaceId"),
    geoSource: readString(formData, "geoSource"),
  });

  if (!geoAddress) {
    redirect(`/admin/restaurants/${restaurantId}/location?error=address_required`);
  }

  const deliveryRadiusMeters = readDeliveryRadiusMeters(formData);
  const prisma = getPrisma();
  const restaurant = await prisma.restaurant.update({
    where: { id: restaurantId },
    data: {
      addressLine: `${geoAddress.city}, ${geoAddress.addressLine}`,
      latitude: geoAddress.latitude,
      longitude: geoAddress.longitude,
      geoProvider: geoAddress.geoProvider,
      geoProviderPlaceId: geoAddress.geoProviderPlaceId,
      geoSource: geoAddress.geoSource,
      geocodedAt: geoAddress.geocodedAt,
      deliveryRadiusMeters,
    },
    select: {
      id: true,
      slug: true,
    },
  });

  revalidatePath("/");
  revalidatePath(`/restaurants/${restaurant.slug}`);
  revalidatePath("/admin");
  revalidatePath("/admin/restaurants");
  revalidatePath(`/admin/restaurants/${restaurant.id}/location`);
  redirect(`/admin/restaurants/${restaurant.id}/location?updated=1`);
}
