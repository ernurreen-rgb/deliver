import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createCheckoutPayloadHash,
  type ExistingCheckoutRequestOrder,
} from "@/domains/orders/checkout-idempotency";
import { createOrderAction } from "@/domains/orders/create-order";
import { Prisma } from "@/generated/prisma/client";

const authMocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
}));

const navigationMocks = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

const prismaMocks = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn(),
    order: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/domains/auth/session", () => ({
  getCurrentUser: authMocks.getCurrentUser,
}));

vi.mock("@/lib/db/prisma", () => ({
  getPrisma: () => prismaMocks.prisma,
}));

vi.mock("next/navigation", () => ({
  redirect: navigationMocks.redirect,
}));

const CHECKOUT_REQUEST_KEY = "aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeeeeeee";
const CART_ITEMS = [
  {
    menuItemId: "item-1",
    quantity: 2,
    restaurantId: "restaurant-1",
  },
];

function makeCheckoutForm(
  overrides: Partial<{
    addressId: string;
    cartItems: typeof CART_ITEMS;
    checkoutRequestKey: string;
    customerComment: string;
    paymentMethod: string;
    promocode: string;
  }> = {},
) {
  const formData = new FormData();
  const checkoutRequestKey =
    overrides.checkoutRequestKey === undefined
      ? CHECKOUT_REQUEST_KEY
      : overrides.checkoutRequestKey;

  if (checkoutRequestKey) {
    formData.set("checkoutRequestKey", checkoutRequestKey);
  }

  formData.set("addressId", overrides.addressId ?? "address-1");
  formData.set("paymentMethod", overrides.paymentMethod ?? "cash_to_courier");
  formData.set("customerComment", overrides.customerComment ?? "");
  formData.set("promocode", overrides.promocode ?? "");
  formData.set(
    "cartPayload",
    JSON.stringify({ items: overrides.cartItems ?? CART_ITEMS }),
  );

  return formData;
}

function makeCheckoutPayloadHash(
  overrides: Partial<{
    addressId: string;
    cartItems: typeof CART_ITEMS;
    customerComment: string;
    paymentMethod: string;
    promocode: string;
  }> = {},
) {
  return createCheckoutPayloadHash({
    addressId: overrides.addressId ?? "address-1",
    cartItems: overrides.cartItems ?? CART_ITEMS,
    customerComment: overrides.customerComment ?? "",
    paymentMethod: overrides.paymentMethod ?? "cash_to_courier",
    promocode: (overrides.promocode ?? "").toUpperCase(),
  });
}

function existingOrder(
  checkoutPayloadHash = makeCheckoutPayloadHash(),
): ExistingCheckoutRequestOrder {
  return {
    checkoutPayloadHash,
    publicNumber: "A-20260619-ABCDEF",
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  authMocks.getCurrentUser.mockResolvedValue({
    id: "user-1",
    name: "Customer",
    phone: "+77000000003",
  });
});

describe("createOrderAction idempotency", () => {
  it("redirects duplicate checkout submissions to the existing order", async () => {
    prismaMocks.prisma.order.findFirst.mockResolvedValue(existingOrder());

    await expect(createOrderAction(makeCheckoutForm())).rejects.toThrow(
      "NEXT_REDIRECT:/orders/A-20260619-ABCDEF?created=1",
    );

    expect(prismaMocks.prisma.order.findFirst).toHaveBeenCalledWith({
      where: {
        checkoutRequestKey: CHECKOUT_REQUEST_KEY,
        customerId: "user-1",
      },
      select: {
        checkoutPayloadHash: true,
        publicNumber: true,
      },
    });
    expect(prismaMocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(navigationMocks.redirect).toHaveBeenCalledWith(
      "/orders/A-20260619-ABCDEF?created=1",
    );
  });

  it("rejects reuse of a checkout request key with a different payload", async () => {
    prismaMocks.prisma.order.findFirst.mockResolvedValue(
      existingOrder("different-hash"),
    );

    await expect(createOrderAction(makeCheckoutForm())).rejects.toThrow(
      "NEXT_REDIRECT:/checkout?error=checkout_request_conflict",
    );

    expect(prismaMocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(navigationMocks.redirect).toHaveBeenCalledWith(
      "/checkout?error=checkout_request_conflict",
    );
  });

  it("rejects malformed checkout request keys before mutating data", async () => {
    await expect(
      createOrderAction(makeCheckoutForm({ checkoutRequestKey: "" })),
    ).rejects.toThrow("NEXT_REDIRECT:/checkout?error=checkout_session_expired");

    expect(prismaMocks.prisma.order.findFirst).not.toHaveBeenCalled();
    expect(prismaMocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("treats checkout request unique collisions as duplicate submissions", async () => {
    const collision = new Prisma.PrismaClientKnownRequestError("Unique failed", {
      clientVersion: "test",
      code: "P2002",
      meta: { target: ["checkoutRequestKey"] },
    });

    prismaMocks.prisma.order.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existingOrder());
    prismaMocks.prisma.$transaction.mockRejectedValueOnce(collision);

    await expect(createOrderAction(makeCheckoutForm())).rejects.toThrow(
      "NEXT_REDIRECT:/orders/A-20260619-ABCDEF?created=1",
    );

    expect(prismaMocks.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMocks.prisma.order.findFirst).toHaveBeenCalledTimes(2);
    expect(navigationMocks.redirect).toHaveBeenCalledWith(
      "/orders/A-20260619-ABCDEF?created=1",
    );
  });
});
