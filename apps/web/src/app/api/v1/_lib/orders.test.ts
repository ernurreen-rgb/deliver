import { describe, expect, it } from "vitest";
import {
  parseCartQuoteRequest,
  parseCreateCashOrderRequest,
} from "./orders";

const validCart = {
  restaurantId: "restaurant-1",
  items: [{ menuItemId: "item-1", quantity: 2 }],
  deliveryAddress: {
    addressLine: "проспект Абая, 10",
    latitude: 43.238949,
    longitude: 76.889709,
  },
};

describe("customer API order payload parsing", () => {
  it("normalizes a valid cart quote payload", () => {
    const parsed = parseCartQuoteRequest({
      ...validCart,
      restaurantId: " restaurant-1 ",
      deliveryAddress: {
        ...validCart.deliveryAddress,
        label: " Дом ",
      },
    });

    expect(parsed).toEqual({
      value: {
        ...validCart,
        deliveryAddress: {
          ...validCart.deliveryAddress,
          label: "Дом",
        },
      },
    });
  });

  it("returns field errors for invalid quantities and coordinates", async () => {
    const parsed = parseCartQuoteRequest({
      restaurantId: "restaurant-1",
      items: [{ menuItemId: "item-1", quantity: 0 }],
      deliveryAddress: {
        addressLine: "проспект Абая, 10",
        latitude: "43.238949",
        longitude: 76.889709,
      },
    });

    expect("response" in parsed).toBe(true);
    if (!("response" in parsed)) return;

    expect(parsed.response.status).toBe(400);
    await expect(parsed.response.json()).resolves.toMatchObject({
      ok: false,
      error: {
        code: "validation_failed",
        fieldErrors: {
          "items.0.quantity": "integer_1_99_required",
          "deliveryAddress.latitude": "number_required",
        },
      },
    });
  });

  it("requires a non-empty idempotency key for cash checkout", async () => {
    const parsed = parseCreateCashOrderRequest({
      ...validCart,
      idempotencyKey: "   ",
    });

    expect("response" in parsed).toBe(true);
    if (!("response" in parsed)) return;

    expect(parsed.response.status).toBe(400);
    await expect(parsed.response.json()).resolves.toMatchObject({
      ok: false,
      error: {
        fieldErrors: { idempotencyKey: "required" },
      },
    });
  });

  it("rejects coordinates outside WGS84 bounds", async () => {
    const parsed = parseCartQuoteRequest({
      ...validCart,
      deliveryAddress: {
        ...validCart.deliveryAddress,
        latitude: 91,
        longitude: -181,
      },
    });

    expect("response" in parsed).toBe(true);
    if (!("response" in parsed)) return;

    await expect(parsed.response.json()).resolves.toMatchObject({
      error: {
        fieldErrors: {
          "deliveryAddress.latitude": "latitude_range_required",
          "deliveryAddress.longitude": "longitude_range_required",
        },
      },
    });
  });

  it("normalizes cash-order metadata without changing the cart", () => {
    expect(
      parseCreateCashOrderRequest({
        ...validCart,
        idempotencyKey: " checkout-123 ",
        customerComment: " Позвонить у двери ",
      }),
    ).toEqual({
      value: {
        ...validCart,
        idempotencyKey: "checkout-123",
        customerComment: "Позвонить у двери",
      },
    });
  });
});
