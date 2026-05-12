"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/domains/auth/session";
import {
  setCourierOfflineForUser,
  setCourierOnlineForUser,
} from "@/domains/delivery/availability";
import {
  acceptCourierOfferForUser,
  dispatchNextCourierOffer,
  rejectCourierOfferForUser,
} from "@/domains/delivery/dispatch";
import {
  releaseAssignedDeliveryForUser,
  transitionCourierDeliveryForUser,
} from "@/domains/delivery/lifecycle";

function readString(formData: FormData, key: string, maxLength = 120) {
  const value = formData.get(key);
  const text = typeof value === "string" ? value.trim() : "";

  if (text.length > maxLength) {
    redirect("/courier?error=input_too_long");
  }

  return text;
}

async function requireCurrentUser() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

function revalidateCourierFlows() {
  revalidatePath("/courier");
  revalidatePath("/operator");
  revalidatePath("/restaurant");
  revalidatePath("/orders");
}

function revalidateCourierDeliveryFlows(publicNumber?: string) {
  revalidateCourierFlows();

  if (publicNumber) {
    revalidatePath(`/orders/${publicNumber}`);
  }
}

export async function acceptCourierOfferAction(formData: FormData) {
  const offerId = readString(formData, "offerId");
  const user = await requireCurrentUser();

  if (!offerId) {
    redirect("/courier?error=offer_required");
  }

  const result = await acceptCourierOfferForUser({
    offerId,
    userId: user.id,
  });

  revalidateCourierFlows();

  if (result.status === "accepted") {
    redirect(`/courier?updated=${result.publicNumber}`);
  }

  redirect(`/courier?error=${result.status}`);
}

export async function rejectCourierOfferAction(formData: FormData) {
  const offerId = readString(formData, "offerId");
  const user = await requireCurrentUser();

  if (!offerId) {
    redirect("/courier?error=offer_required");
  }

  const result = await rejectCourierOfferForUser({
    offerId,
    userId: user.id,
  });

  revalidateCourierFlows();

  if (result.status === "rejected") {
    redirect("/courier?updated=offer_rejected");
  }

  if (result.status === "expired") {
    redirect("/courier?error=offer_expired");
  }

  redirect(`/courier?error=${result.status}`);
}

export async function goOnlineCourierAction() {
  const user = await requireCurrentUser();
  const result = await setCourierOnlineForUser(user.id);

  revalidateCourierFlows();

  if (result.status === "updated") {
    redirect("/courier?updated=courier_online");
  }

  redirect(`/courier?error=${result.status}`);
}

export async function goOfflineCourierAction() {
  const user = await requireCurrentUser();
  const result = await setCourierOfflineForUser(user.id);

  revalidateCourierFlows();

  if (result.status === "updated") {
    redirect("/courier?updated=courier_offline");
  }

  redirect(`/courier?error=${result.status}`);
}

export async function markDeliveryPickedUpAction(formData: FormData) {
  const deliveryId = readString(formData, "deliveryId");
  const user = await requireCurrentUser();
  const now = new Date();

  if (!deliveryId) {
    redirect("/courier?error=delivery_required");
  }

  const result = await transitionCourierDeliveryForUser({
    deliveryId,
    userId: user.id,
    deliveryFromStatus: "assigned",
    orderFromStatus: "ready_for_pickup",
    deliveryToStatus: "picked_up",
    orderToStatus: "picked_up",
    pickedUpAt: now,
    comment: "Courier picked up the order.",
  });

  revalidateCourierDeliveryFlows(
    "publicNumber" in result ? result.publicNumber : undefined,
  );

  if (result.status === "updated") {
    redirect(`/courier?updated=${result.publicNumber}`);
  }

  redirect(`/courier?error=${result.status}`);
}

export async function startDeliveryAction(formData: FormData) {
  const deliveryId = readString(formData, "deliveryId");
  const user = await requireCurrentUser();

  if (!deliveryId) {
    redirect("/courier?error=delivery_required");
  }

  const result = await transitionCourierDeliveryForUser({
    deliveryId,
    userId: user.id,
    deliveryFromStatus: "picked_up",
    orderFromStatus: "picked_up",
    deliveryToStatus: "delivering",
    orderToStatus: "delivering",
    comment: "Courier started delivery.",
  });

  revalidateCourierDeliveryFlows(
    "publicNumber" in result ? result.publicNumber : undefined,
  );

  if (result.status === "updated") {
    redirect(`/courier?updated=${result.publicNumber}`);
  }

  redirect(`/courier?error=${result.status}`);
}

export async function completeDeliveryAction(formData: FormData) {
  const deliveryId = readString(formData, "deliveryId");
  const user = await requireCurrentUser();
  const now = new Date();

  if (!deliveryId) {
    redirect("/courier?error=delivery_required");
  }

  const result = await transitionCourierDeliveryForUser({
    deliveryId,
    userId: user.id,
    deliveryFromStatus: "delivering",
    orderFromStatus: "delivering",
    deliveryToStatus: "delivered",
    orderToStatus: "delivered",
    deliveredAt: now,
    releaseCourier: true,
    settleFinances: true,
    comment: "Courier completed delivery.",
  });

  revalidateCourierDeliveryFlows(
    "publicNumber" in result ? result.publicNumber : undefined,
  );

  if (result.status === "updated") {
    redirect(`/courier?updated=${result.publicNumber}`);
  }

  redirect(`/courier?error=${result.status}`);
}

export async function releaseAssignedDeliveryAction(formData: FormData) {
  const deliveryId = readString(formData, "deliveryId");
  const reason = readString(formData, "reason", 240);
  const user = await requireCurrentUser();

  if (!deliveryId) {
    redirect("/courier?error=delivery_required");
  }

  const result = await releaseAssignedDeliveryForUser({
    deliveryId,
    userId: user.id,
    reason,
  });

  if (result.status === "updated") {
    await dispatchNextCourierOffer(result.deliveryId);
    revalidateCourierDeliveryFlows(result.publicNumber);
    redirect(`/courier?updated=released_${result.publicNumber}`);
  }

  revalidateCourierDeliveryFlows(
    "publicNumber" in result ? result.publicNumber : undefined,
  );

  redirect(`/courier?error=${result.status}`);
}
