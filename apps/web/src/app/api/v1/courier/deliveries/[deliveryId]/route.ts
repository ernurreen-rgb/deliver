import { revalidatePath } from "next/cache";
import type { NextRequest } from "next/server";
import type {
  CourierDeliveryActionRequest,
  CourierMutationResponse,
} from "@deliver/contracts/courier";
import { getCourierMobileDashboard } from "@/domains/couriers/api";
import { dispatchNextCourierOffer } from "@/domains/delivery/dispatch";
import {
  releaseAssignedDeliveryForUser,
  transitionCourierDeliveryForUser,
} from "@/domains/delivery/lifecycle";
import { requireApiCourier } from "../../../_lib/auth";
import {
  courierDomainError,
  parseCourierDeliveryActionRequest,
} from "../../../_lib/courier";
import { jsonError, jsonOk, readJsonObject } from "../../../_lib/responses";

async function runDeliveryAction(input: {
  action: CourierDeliveryActionRequest;
  deliveryId: string;
  userId: string;
}) {
  const now = new Date();

  if (input.action.action === "pickup") {
    return transitionCourierDeliveryForUser({
      deliveryId: input.deliveryId,
      userId: input.userId,
      deliveryFromStatus: "assigned",
      orderFromStatus: "ready_for_pickup",
      deliveryToStatus: "picked_up",
      orderToStatus: "picked_up",
      pickedUpAt: now,
      comment: "Courier picked up the order through courier-mobile.",
    });
  }

  if (input.action.action === "start") {
    return transitionCourierDeliveryForUser({
      deliveryId: input.deliveryId,
      userId: input.userId,
      deliveryFromStatus: "picked_up",
      orderFromStatus: "picked_up",
      deliveryToStatus: "delivering",
      orderToStatus: "delivering",
      comment: "Courier started delivery through courier-mobile.",
    });
  }

  if (input.action.action === "complete") {
    return transitionCourierDeliveryForUser({
      deliveryId: input.deliveryId,
      userId: input.userId,
      deliveryFromStatus: "delivering",
      orderFromStatus: "delivering",
      deliveryToStatus: "delivered",
      orderToStatus: "delivered",
      deliveredAt: now,
      releaseCourier: true,
      settleFinances: true,
      cashCollectedConfirmed: true,
      comment: "Courier completed delivery through courier-mobile.",
    });
  }

  const released = await releaseAssignedDeliveryForUser({
    deliveryId: input.deliveryId,
    userId: input.userId,
    reason: input.action.reason,
    now,
  });

  if (released.status === "updated") {
    await dispatchNextCourierOffer(released.deliveryId, now);
  }

  return released;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ deliveryId: string }> },
) {
  const auth = await requireApiCourier(request);

  if ("response" in auth) return auth.response;

  const body = await readJsonObject(request);
  if (!body) {
    return jsonError({
      status: 400,
      code: "bad_request",
      message: "Expected a JSON object.",
    });
  }

  const parsed = parseCourierDeliveryActionRequest(body);
  if ("response" in parsed) return parsed.response;

  const { deliveryId } = await context.params;
  const result = await runDeliveryAction({
    action: parsed.value,
    deliveryId,
    userId: auth.user.id,
  });

  if (result.status !== "updated") return courierDomainError(result.status);

  const dashboard = await getCourierMobileDashboard(auth.user.id);
  if (!dashboard) return courierDomainError("courier_not_found");

  revalidatePath("/courier");
  revalidatePath("/operator");
  revalidatePath("/restaurant");
  revalidatePath("/orders");
  revalidatePath(`/orders/${result.publicNumber}`);

  return jsonOk<CourierMutationResponse>({
    dashboard,
    orderNumber: result.publicNumber,
  });
}
