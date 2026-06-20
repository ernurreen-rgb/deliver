import type {
  CartQuoteRequest,
  CreateCashOrderRequest,
  DeliveryAddressInput,
} from "@deliver/contracts/orders";
import { jsonError } from "./responses";

const MAX_ITEMS = 50;

type ParsedRequest<T> =
  | { value: T }
  | { response: Response };

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parseDeliveryAddress(
  value: unknown,
  fieldErrors: Record<string, string>,
) {
  if (!isObject(value)) {
    fieldErrors.deliveryAddress = "required";
    return null;
  }

  const addressLine = readOptionalString(value.addressLine);
  const latitude = value.latitude;
  const longitude = value.longitude;

  if (!addressLine) {
    fieldErrors["deliveryAddress.addressLine"] = "required";
  }

  if (typeof latitude !== "number" || !Number.isFinite(latitude)) {
    fieldErrors["deliveryAddress.latitude"] = "number_required";
  } else if (latitude < -90 || latitude > 90) {
    fieldErrors["deliveryAddress.latitude"] = "latitude_range_required";
  }

  if (typeof longitude !== "number" || !Number.isFinite(longitude)) {
    fieldErrors["deliveryAddress.longitude"] = "number_required";
  } else if (longitude < -180 || longitude > 180) {
    fieldErrors["deliveryAddress.longitude"] = "longitude_range_required";
  }

  if (
    !addressLine ||
    typeof latitude !== "number" ||
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    typeof longitude !== "number" ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  return {
    label: readOptionalString(value.label),
    addressLine,
    apartment: readOptionalString(value.apartment),
    entrance: readOptionalString(value.entrance),
    floor: readOptionalString(value.floor),
    comment: readOptionalString(value.comment),
    latitude,
    longitude,
  } satisfies DeliveryAddressInput;
}

function parseItems(value: unknown, fieldErrors: Record<string, string>) {
  if (!Array.isArray(value) || value.length === 0) {
    fieldErrors.items = "non_empty_array_required";
    return null;
  }

  if (value.length > MAX_ITEMS) {
    fieldErrors.items = "too_many_items";
    return null;
  }

  const items = value.flatMap((item, index) => {
    if (!isObject(item)) {
      fieldErrors[`items.${index}`] = "object_required";
      return [];
    }

    const menuItemId = readOptionalString(item.menuItemId);
    const quantity = item.quantity;

    if (!menuItemId) {
      fieldErrors[`items.${index}.menuItemId`] = "required";
    }

    if (
      !Number.isInteger(quantity) ||
      typeof quantity !== "number" ||
      quantity < 1 ||
      quantity > 99
    ) {
      fieldErrors[`items.${index}.quantity`] = "integer_1_99_required";
    }

    return menuItemId && typeof quantity === "number"
      ? [{ menuItemId, quantity }]
      : [];
  });

  return Object.keys(fieldErrors).some((key) => key.startsWith("items"))
    ? null
    : items;
}

export function parseCartQuoteRequest(
  body: Record<string, unknown>,
): ParsedRequest<CartQuoteRequest> {
  const fieldErrors: Record<string, string> = {};
  const restaurantId = readOptionalString(body.restaurantId);
  const items = parseItems(body.items, fieldErrors);
  const deliveryAddress = parseDeliveryAddress(
    body.deliveryAddress,
    fieldErrors,
  );

  if (!restaurantId) {
    fieldErrors.restaurantId = "required";
  }

  if (!restaurantId || !items || !deliveryAddress) {
    return {
      response: jsonError({
        status: 400,
        code: "validation_failed",
        message: "Invalid cart payload.",
        fieldErrors,
      }),
    } as const;
  }

  return {
    value: {
      restaurantId,
      items,
      deliveryAddress,
    } satisfies CartQuoteRequest,
  } as const;
}

export function parseCreateCashOrderRequest(
  body: Record<string, unknown>,
): ParsedRequest<CreateCashOrderRequest> {
  const parsed = parseCartQuoteRequest(body);

  if ("response" in parsed) {
    return { response: parsed.response };
  }

  const idempotencyKey = readOptionalString(body.idempotencyKey);

  if (!idempotencyKey) {
    return {
      response: jsonError({
        status: 400,
        code: "validation_failed",
        message: "idempotencyKey is required.",
        fieldErrors: { idempotencyKey: "required" },
      }),
    } as const;
  }

  return {
    value: {
      ...parsed.value,
      idempotencyKey,
      customerComment: readOptionalString(body.customerComment),
    } satisfies CreateCashOrderRequest,
  } as const;
}
