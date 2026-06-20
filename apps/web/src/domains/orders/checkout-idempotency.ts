import { createHash } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";

export const CHECKOUT_REQUEST_KEY_FIELD = "checkoutRequestKey";
export const CHECKOUT_REQUEST_KEY_MAX_LENGTH = 64;

const CHECKOUT_REQUEST_KEY_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CheckoutRequestOrderClient = Pick<Prisma.TransactionClient, "order">;

export type ExistingCheckoutRequestOrder = {
  checkoutPayloadHash: string | null;
  publicNumber: string;
};

type CheckoutPayloadCartItem = {
  menuItemId: string;
  quantity: number;
  restaurantId: string;
};

type CheckoutPayloadHashInput = {
  addressId: string;
  cartItems: readonly CheckoutPayloadCartItem[];
  customerComment: string;
  paymentMethod: string;
  promocode: string;
};

export function readCheckoutRequestKey(formData: FormData) {
  const value = formData.get(CHECKOUT_REQUEST_KEY_FIELD);

  if (typeof value !== "string") {
    return null;
  }

  const key = value.trim();

  if (
    key.length === 0 ||
    key.length > CHECKOUT_REQUEST_KEY_MAX_LENGTH ||
    !CHECKOUT_REQUEST_KEY_PATTERN.test(key)
  ) {
    return null;
  }

  return key.toLowerCase();
}

export function isUniqueConstraintOn(error: unknown, fieldName: string) {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== "P2002"
  ) {
    return false;
  }

  const target = error.meta?.target;

  return Array.isArray(target)
    ? target.includes(fieldName)
    : String(target ?? "").includes(fieldName);
}

export function isCheckoutRequestKeyCollision(error: unknown) {
  return isUniqueConstraintOn(error, CHECKOUT_REQUEST_KEY_FIELD);
}

export function createCheckoutPayloadHash(input: CheckoutPayloadHashInput) {
  const canonicalPayload = {
    addressId: input.addressId,
    cartItems: [...input.cartItems]
      .map((item) => ({
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        restaurantId: item.restaurantId,
      }))
      .sort((left, right) =>
        `${left.restaurantId}:${left.menuItemId}`.localeCompare(
          `${right.restaurantId}:${right.menuItemId}`,
        ),
      ),
    customerComment: input.customerComment,
    paymentMethod: input.paymentMethod,
    promocode: input.promocode,
  };

  return createHash("sha256")
    .update(JSON.stringify(canonicalPayload))
    .digest("hex");
}

export function isSameCheckoutPayload(
  order: ExistingCheckoutRequestOrder,
  checkoutPayloadHash: string,
) {
  return order.checkoutPayloadHash === checkoutPayloadHash;
}

export async function findExistingCheckoutRequestOrder(
  client: CheckoutRequestOrderClient,
  input: {
    checkoutRequestKey: string;
    customerId: string;
  },
): Promise<ExistingCheckoutRequestOrder | null> {
  return client.order.findFirst({
    where: {
      checkoutRequestKey: input.checkoutRequestKey,
      customerId: input.customerId,
    },
    select: {
      checkoutPayloadHash: true,
      publicNumber: true,
    },
  });
}
