"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";
import { requireAnyRole } from "@/domains/auth/authorization";
import { writeAuditLog } from "@/domains/audit/log";
import {
  canSetCourierStatus,
  isOperatorSettableCourierStatus,
  isTransportType,
} from "@/domains/couriers/operations";
import { dispatchNextCourierOffer } from "@/domains/delivery/dispatch";
import { isPointInAlmaty, parseGeoPoint } from "@/domains/geo";
import { getPrisma } from "@/lib/db/prisma";

const activeDeliveryStatuses = ["assigned", "picked_up", "delivering"] as const;

type CourierOperationResult =
  | { status: "updated"; courierId: string }
  | { status: "active_delivery_exists"; courierId?: string }
  | { status: "courier_location_required"; courierId?: string }
  | { status: "courier_not_found"; courierId?: string }
  | { status: "invalid_courier_status"; courierId?: string }
  | { status: "invalid_location"; courierId?: string }
  | { status: "invalid_transport"; courierId?: string }
  | { status: "profile_required"; courierId?: string };

function readString(formData: FormData, key: string, maxLength = 160) {
  const value = formData.get(key);
  const text = typeof value === "string" ? value.trim() : "";

  if (text.length > maxLength) {
    redirect("/operator/couriers?error=input_too_long");
  }

  return text;
}

function revalidateCourierOperations() {
  revalidatePath("/operator/couriers");
  revalidatePath("/operator");
  revalidatePath("/courier");
}

function redirectCourierOperation(result: CourierOperationResult) {
  revalidateCourierOperations();

  if (result.status === "updated") {
    redirect(`/operator/couriers?updated=${result.courierId}`);
  }

  redirect(`/operator/couriers?error=${result.status}`);
}

async function updateCourierProfile(input: {
  actorUserId: string;
  courierId: string;
  fullName: string;
  phone: string;
  transportType: string;
  documentNumber: string;
}): Promise<CourierOperationResult> {
  if (!input.fullName || !input.phone) {
    return { status: "profile_required", courierId: input.courierId };
  }

  const transportType = input.transportType;

  if (!isTransportType(transportType)) {
    return { status: "invalid_transport", courierId: input.courierId };
  }

  const prisma = getPrisma();

  const courier = await prisma.courier.findUnique({
    where: { id: input.courierId },
    select: { id: true, profile: true },
  });

  if (!courier) {
    return { status: "courier_not_found", courierId: input.courierId };
  }

  await prisma.$transaction(async (tx) => {
    await tx.courierProfile.upsert({
      where: { courierId: courier.id },
      create: {
        courierId: courier.id,
        fullName: input.fullName,
        phone: input.phone,
        transportType,
        documentNumber: input.documentNumber || null,
      },
      update: {
        fullName: input.fullName,
        phone: input.phone,
        transportType,
        documentNumber: input.documentNumber || null,
      },
    });

    await writeAuditLog({
      tx,
      actorUserId: input.actorUserId,
      entityType: "courier",
      entityId: courier.id,
      action: "operator_updated_courier_profile_v1",
      metadata: {
        fullName: input.fullName,
        phone: input.phone,
        transportType,
        documentNumber: input.documentNumber || null,
      },
    });
  });

  return { status: "updated", courierId: courier.id };
}

async function updateCourierLocation(input: {
  actorUserId: string;
  courierId: string;
  latitude: string;
  longitude: string;
}): Promise<CourierOperationResult> {
  const point = parseGeoPoint({
    latitude: input.latitude,
    longitude: input.longitude,
  });

  if (!point || !isPointInAlmaty(point)) {
    return { status: "invalid_location", courierId: input.courierId };
  }

  const prisma = getPrisma();
  const courier = await prisma.courier.findUnique({
    where: { id: input.courierId },
    select: {
      id: true,
      status: true,
      availability: {
        select: {
          latitude: true,
          longitude: true,
        },
      },
    },
  });

  if (!courier) {
    return { status: "courier_not_found", courierId: input.courierId };
  }

  await prisma.$transaction(async (tx) => {
    await tx.courierAvailability.upsert({
      where: { courierId: courier.id },
      create: {
        courierId: courier.id,
        status: courier.status === "busy" ? "inactive" : courier.status,
        latitude: new Prisma.Decimal(point.latitude),
        longitude: new Prisma.Decimal(point.longitude),
      },
      update: {
        latitude: new Prisma.Decimal(point.latitude),
        longitude: new Prisma.Decimal(point.longitude),
      },
    });

    await writeAuditLog({
      tx,
      actorUserId: input.actorUserId,
      entityType: "courier",
      entityId: courier.id,
      action: "operator_updated_courier_location_v1",
      metadata: {
        previousLatitude: courier.availability?.latitude?.toString() ?? null,
        previousLongitude: courier.availability?.longitude?.toString() ?? null,
        latitude: point.latitude,
        longitude: point.longitude,
      },
    });
  });

  return { status: "updated", courierId: courier.id };
}

async function updateCourierStatus(input: {
  actorUserId: string;
  courierId: string;
  status: string;
}): Promise<CourierOperationResult> {
  const targetStatus = input.status;

  if (!isOperatorSettableCourierStatus(targetStatus)) {
    return { status: "invalid_courier_status", courierId: input.courierId };
  }

  const prisma = getPrisma();
  const now = new Date();
  const courier = await prisma.courier.findUnique({
    where: { id: input.courierId },
    include: {
      availability: true,
      deliveries: {
        where: {
          status: { in: [...activeDeliveryStatuses] },
        },
        select: { id: true },
      },
      offers: {
        where: { status: "pending" },
        select: { deliveryId: true },
      },
    },
  });

  if (!courier) {
    return { status: "courier_not_found", courierId: input.courierId };
  }

  const check = canSetCourierStatus({
    targetStatus,
    activeDeliveryCount: courier.deliveries.length,
    hasLocation: Boolean(courier.availability?.latitude && courier.availability.longitude),
  });

  if (check !== "ok") {
    return { status: check, courierId: input.courierId };
  }

  const cancelledOfferDeliveryIds =
    targetStatus === "available"
      ? []
      : [...new Set(courier.offers.map((offer) => offer.deliveryId))];

  await prisma.$transaction(async (tx) => {
    await tx.courier.update({
      where: { id: courier.id },
      data: { status: targetStatus },
    });

    await tx.courierAvailability.upsert({
      where: { courierId: courier.id },
      create: {
        courierId: courier.id,
        status: targetStatus,
      },
      update: {
        status: targetStatus,
      },
    });

    if (cancelledOfferDeliveryIds.length > 0) {
      await tx.courierOffer.updateMany({
        where: {
          courierId: courier.id,
          status: "pending",
        },
        data: {
          status: "cancelled",
          respondedAt: now,
        },
      });
    }

    await writeAuditLog({
      tx,
      actorUserId: input.actorUserId,
      entityType: "courier",
      entityId: courier.id,
      action: "operator_updated_courier_status_v1",
      metadata: {
        fromStatus: courier.status,
        toStatus: targetStatus,
        cancelledPendingOffers: cancelledOfferDeliveryIds.length,
      },
    });
  });

  for (const deliveryId of cancelledOfferDeliveryIds) {
    await dispatchNextCourierOffer(deliveryId, now);
  }

  return { status: "updated", courierId: courier.id };
}

export async function updateCourierProfileAction(formData: FormData) {
  const user = await requireAnyRole(["operator", "admin"]);
  const courierId = readString(formData, "courierId");

  if (!courierId) {
    redirect("/operator/couriers?error=courier_required");
  }

  const result = await updateCourierProfile({
    actorUserId: user.id,
    courierId,
    fullName: readString(formData, "fullName", 120),
    phone: readString(formData, "phone", 40),
    transportType: readString(formData, "transportType", 40),
    documentNumber: readString(formData, "documentNumber", 120),
  });

  redirectCourierOperation(result);
}

export async function updateCourierLocationAction(formData: FormData) {
  const user = await requireAnyRole(["operator", "admin"]);
  const courierId = readString(formData, "courierId");

  if (!courierId) {
    redirect("/operator/couriers?error=courier_required");
  }

  const result = await updateCourierLocation({
    actorUserId: user.id,
    courierId,
    latitude: readString(formData, "latitude", 40),
    longitude: readString(formData, "longitude", 40),
  });

  redirectCourierOperation(result);
}

export async function updateCourierStatusAction(formData: FormData) {
  const user = await requireAnyRole(["operator", "admin"]);
  const courierId = readString(formData, "courierId");

  if (!courierId) {
    redirect("/operator/couriers?error=courier_required");
  }

  const result = await updateCourierStatus({
    actorUserId: user.id,
    courierId,
    status: readString(formData, "status", 40),
  });

  redirectCourierOperation(result);
}
