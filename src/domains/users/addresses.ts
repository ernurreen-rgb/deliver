"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/domains/auth/session";
import { parseSubmittedGeoAddress } from "@/domains/geo";
import { getPrisma } from "@/lib/db/prisma";

const addressFieldLimits = {
  label: 80,
  city: 80,
  addressLine: 240,
  street: 160,
  house: 32,
  apartment: 32,
  entrance: 32,
  floor: 32,
  intercom: 32,
  comment: 500,
} as const;

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function readAddressString(
  formData: FormData,
  key: keyof typeof addressFieldLimits,
) {
  const value = readString(formData, key);

  if (value.length > addressFieldLimits[key]) {
    redirect("/account/addresses?error=input_too_long");
  }

  return value;
}

function nullable(value: string) {
  return value.length > 0 ? value : null;
}

export async function createAddressAction(formData: FormData) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const addressLine = readAddressString(formData, "addressLine");
  const geoAddress = parseSubmittedGeoAddress({
    city: readAddressString(formData, "city"),
    addressLine,
    latitude: readString(formData, "latitude"),
    longitude: readString(formData, "longitude"),
    geoProvider: readString(formData, "geoProvider"),
    geoProviderPlaceId: readString(formData, "geoProviderPlaceId"),
    geoSource: readString(formData, "geoSource"),
  });

  if (!addressLine || !geoAddress) {
    redirect("/account/addresses?error=address_required");
  }

  const street = nullable(readAddressString(formData, "street"));
  const house = nullable(readAddressString(formData, "house"));
  await getPrisma().address.create({
    data: {
      userId: user.id,
      label: nullable(readAddressString(formData, "label")),
      city: geoAddress.city,
      addressLine: geoAddress.addressLine,
      street,
      house,
      apartment: nullable(readAddressString(formData, "apartment")),
      entrance: nullable(readAddressString(formData, "entrance")),
      floor: nullable(readAddressString(formData, "floor")),
      intercom: nullable(readAddressString(formData, "intercom")),
      comment: nullable(readAddressString(formData, "comment")),
      latitude: geoAddress.latitude,
      longitude: geoAddress.longitude,
      geoProvider: geoAddress.geoProvider,
      geoProviderPlaceId: geoAddress.geoProviderPlaceId,
      geoSource: geoAddress.geoSource,
      geocodedAt: geoAddress.geocodedAt,
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
