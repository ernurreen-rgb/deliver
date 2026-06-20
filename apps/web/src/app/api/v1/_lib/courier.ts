import type {
  CourierDeliveryActionRequest,
  CourierOfferActionRequest,
  UpdateCourierAvailabilityRequest,
} from "@deliver/contracts/courier";
import { jsonError } from "./responses";

export function parseCourierAvailabilityRequest(body: Record<string, unknown>) {
  if (typeof body.online !== "boolean") {
    return {
      response: jsonError({
        status: 400,
        code: "validation_failed",
        message: "online must be a boolean.",
        fieldErrors: { online: "boolean_required" },
      }),
    } as const;
  }

  return {
    value: { online: body.online } satisfies UpdateCourierAvailabilityRequest,
  } as const;
}

export function parseCourierOfferActionRequest(body: Record<string, unknown>) {
  if (body.action !== "accept" && body.action !== "reject") {
    return {
      response: jsonError({
        status: 400,
        code: "validation_failed",
        message: "action must be accept or reject.",
        fieldErrors: { action: "invalid_action" },
      }),
    } as const;
  }

  return {
    value: { action: body.action } satisfies CourierOfferActionRequest,
  } as const;
}

export function parseCourierDeliveryActionRequest(
  body: Record<string, unknown>,
) {
  if (body.action === "pickup" || body.action === "start") {
    return {
      value: { action: body.action } satisfies CourierDeliveryActionRequest,
    } as const;
  }

  if (body.action === "complete") {
    if (body.cashCollectedConfirmed !== true) {
      return {
        response: jsonError({
          status: 400,
          code: "validation_failed",
          message: "Cash collection must be confirmed.",
          reason: "cash_confirmation_required",
          fieldErrors: {
            cashCollectedConfirmed: "confirmation_required",
          },
        }),
      } as const;
    }

    return {
      value: {
        action: "complete",
        cashCollectedConfirmed: true,
      } satisfies CourierDeliveryActionRequest,
    } as const;
  }

  if (body.action === "release") {
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";

    if (!reason || reason.length > 240) {
      return {
        response: jsonError({
          status: 400,
          code: "validation_failed",
          message: "A release reason of at most 240 characters is required.",
          reason: "reason_required",
          fieldErrors: { reason: !reason ? "required" : "too_long" },
        }),
      } as const;
    }

    return {
      value: { action: "release", reason } satisfies CourierDeliveryActionRequest,
    } as const;
  }

  return {
    response: jsonError({
      status: 400,
      code: "validation_failed",
      message: "Unsupported courier delivery action.",
      fieldErrors: { action: "invalid_action" },
    }),
  } as const;
}

export function courierDomainError(reason: string) {
  const notFound = new Set([
    "courier_not_found",
    "delivery_not_found",
    "offer_not_found",
  ]);

  return jsonError({
    status: notFound.has(reason) ? 404 : 409,
    code: notFound.has(reason) ? "not_found" : "conflict",
    message: "The courier operation could not be completed.",
    reason,
  });
}
