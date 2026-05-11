"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/domains/auth/session";
import { geocodeAddress } from "@/domains/geo/geocode";
import { getPrisma } from "@/lib/db/prisma";

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function nullable(value: string) {
  return value.length > 0 ? value : null;
}

export async function createAddressAction(formData: FormData) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const addressLine = readString(formData, "addressLine");

  if (!addressLine) {
    redirect("/account/addresses?error=address_required");
  }

  const city = readString(formData, "city") || "Алматы";
  const street = nullable(readString(formData, "street"));
  const house = nullable(readString(formData, "house"));
  const coordinates = await geocodeAddress({
    city,
    addressLine,
    street,
    house,
  });

  if (!coordinates) {
    redirect("/account/addresses?error=geocode_failed");
  }

  await getPrisma().address.create({
    data: {
      userId: user.id,
      label: nullable(readString(formData, "label")),
      city,
      addressLine,
      street,
      house,
      apartment: nullable(readString(formData, "apartment")),
      entrance: nullable(readString(formData, "entrance")),
      floor: nullable(readString(formData, "floor")),
      intercom: nullable(readString(formData, "intercom")),
      comment: nullable(readString(formData, "comment")),
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
    },
  });

  revalidatePath("/account");
  revalidatePath("/account/addresses");
  revalidatePath("/checkout");
  redirect("/account/addresses?saved=1");
}

export async function deleteAddressAction(formData: FormData) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const addressId = readString(formData, "addressId");

  if (!addressId) {
    redirect("/account/addresses");
  }

  await getPrisma().address.deleteMany({
    where: {
      id: addressId,
      userId: user.id,
    },
  });

  revalidatePath("/account");
  revalidatePath("/account/addresses");
  revalidatePath("/checkout");
  redirect("/account/addresses?deleted=1");
}
