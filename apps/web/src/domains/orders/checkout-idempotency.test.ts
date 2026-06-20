import { describe, expect, it, vi } from "vitest";
import {
  CHECKOUT_REQUEST_KEY_FIELD,
  createCheckoutPayloadHash,
  findExistingCheckoutRequestOrder,
  isSameCheckoutPayload,
  isUniqueConstraintOn,
  readCheckoutRequestKey,
} from "@/domains/orders/checkout-idempotency";
import { Prisma } from "@/generated/prisma/client";

describe("readCheckoutRequestKey", () => {
  it("normalizes a valid checkout request key", () => {
    const formData = new FormData();
    formData.set(CHECKOUT_REQUEST_KEY_FIELD, "  AAAAAAAA-BBBB-4CCC-9DDD-EEEEEEEEEEEE  ");

    expect(readCheckoutRequestKey(formData)).toBe(
      "aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeeeeeee",
    );
  });

  it("rejects missing or malformed checkout request keys", () => {
    expect(readCheckoutRequestKey(new FormData())).toBeNull();

    const formData = new FormData();
    formData.set(CHECKOUT_REQUEST_KEY_FIELD, "not-a-request-key");

    expect(readCheckoutRequestKey(formData)).toBeNull();
  });
});

describe("isUniqueConstraintOn", () => {
  it("matches Prisma unique constraint targets by field name", () => {
    const error = new Prisma.PrismaClientKnownRequestError("Unique failed", {
      code: "P2002",
      clientVersion: "test",
      meta: { target: ["checkoutRequestKey"] },
    });

    expect(isUniqueConstraintOn(error, "checkoutRequestKey")).toBe(true);
    expect(isUniqueConstraintOn(error, "publicNumber")).toBe(false);
  });
});

describe("createCheckoutPayloadHash", () => {
  it("keeps cart item order out of the canonical checkout payload", () => {
    const base = {
      addressId: "address-1",
      customerComment: "call first",
      paymentMethod: "cash_to_courier",
      promocode: "START",
    };
    const hash = createCheckoutPayloadHash({
      ...base,
      cartItems: [
        { menuItemId: "item-2", quantity: 1, restaurantId: "restaurant-1" },
        { menuItemId: "item-1", quantity: 2, restaurantId: "restaurant-1" },
      ],
    });

    expect(
      createCheckoutPayloadHash({
        ...base,
        cartItems: [
          { menuItemId: "item-1", quantity: 2, restaurantId: "restaurant-1" },
          { menuItemId: "item-2", quantity: 1, restaurantId: "restaurant-1" },
        ],
      }),
    ).toBe(hash);
  });

  it("changes when checkout-critical fields change", () => {
    const base = {
      addressId: "address-1",
      cartItems: [
        { menuItemId: "item-1", quantity: 2, restaurantId: "restaurant-1" },
      ],
      customerComment: "",
      paymentMethod: "cash_to_courier",
      promocode: "",
    };

    expect(
      createCheckoutPayloadHash({
        ...base,
        cartItems: [
          { menuItemId: "item-1", quantity: 3, restaurantId: "restaurant-1" },
        ],
      }),
    ).not.toBe(createCheckoutPayloadHash(base));
    expect(createCheckoutPayloadHash({ ...base, addressId: "address-2" })).not.toBe(
      createCheckoutPayloadHash(base),
    );
  });
});

describe("isSameCheckoutPayload", () => {
  it("requires the stored hash to match the current checkout payload", () => {
    expect(
      isSameCheckoutPayload(
        {
          checkoutPayloadHash: "hash-1",
          publicNumber: "A-20260619-ABCDEF",
        },
        "hash-1",
      ),
    ).toBe(true);
    expect(
      isSameCheckoutPayload(
        {
          checkoutPayloadHash: "hash-1",
          publicNumber: "A-20260619-ABCDEF",
        },
        "hash-2",
      ),
    ).toBe(false);
  });
});

describe("findExistingCheckoutRequestOrder", () => {
  it("scopes duplicate checkout requests to the current customer", async () => {
    const findFirst = vi.fn().mockResolvedValue({
      checkoutPayloadHash: "hash-1",
      publicNumber: "A-20260619-ABCDEF",
    });
    const client = {
      order: {
        findFirst,
      },
    } as unknown as Parameters<typeof findExistingCheckoutRequestOrder>[0];

    await expect(
      findExistingCheckoutRequestOrder(client, {
        checkoutRequestKey: "aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeeeeeee",
        customerId: "user-1",
      }),
    ).resolves.toEqual({
      checkoutPayloadHash: "hash-1",
      publicNumber: "A-20260619-ABCDEF",
    });
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        checkoutRequestKey: "aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeeeeeee",
        customerId: "user-1",
      },
      select: {
        checkoutPayloadHash: true,
        publicNumber: true,
      },
    });
  });
});
