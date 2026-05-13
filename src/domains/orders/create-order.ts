"use server";

import { redirect } from "next/navigation";
import { getPrisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/domains/auth/session";
import { Prisma } from "@/generated/prisma/client";
import {
  calculateDeliveryFee,
  calculateDistanceMeters,
  toNumber,
} from "@/domains/delivery/pricing";
import type { CartState } from "@/domains/cart/types";
import { createPublicOrderNumber } from "@/domains/orders/public-number";

type ParsedCartItem = {
  menuItemId: string;
  restaurantId: string;
  quantity: number;
};

type CheckoutError =
  | "address_not_found"
  | "cart_changed"
  | "delivery_rule_missing"
  | "minimum_order"
  | "missing_coordinates"
  | "outside_radius"
  | "restaurant_unavailable"
  | "single_restaurant_only";

type CreateOrderTransactionResult =
  | { status: "created"; publicNumber: string }
  | { status: "failed"; error: CheckoutError };

const MAX_CART_PAYLOAD_LENGTH = 50_000;
const MAX_CUSTOMER_COMMENT_LENGTH = 500;
const MAX_PROMOCODE_LENGTH = 32;
const PUBLIC_ORDER_NUMBER_RETRY_COUNT = 3;

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function parseCartPayload(payload: string): ParsedCartItem[] {
  if (!payload) {
    return [];
  }

  try {
    const parsed = JSON.parse(payload) as CartState;
    if (!Array.isArray(parsed.items)) {
      return [];
    }

    return parsed.items
      .map((item) => ({
        menuItemId: String(item.menuItemId),
        restaurantId: typeof item.restaurantId === "string" ? item.restaurantId : "",
        quantity: Number(item.quantity),
      }))
      .filter(
        (item) =>
          item.menuItemId.length > 0 &&
          Number.isInteger(item.quantity) &&
          item.quantity > 0 &&
          item.quantity <= 99,
      );
  } catch {
    return [];
  }
}

function getCartRestaurantId(cartItems: ParsedCartItem[]) {
  const restaurantIds = new Set(cartItems.map((item) => item.restaurantId));

  if (restaurantIds.size !== 1) {
    return null;
  }

  const [restaurantId] = restaurantIds;
  return restaurantId || null;
}

function checkoutFailure(error: CheckoutError): CreateOrderTransactionResult {
  return { status: "failed", error };
}

function redirectCheckoutError(error: CheckoutError): never {
  redirect(`/checkout?error=${error}`);
}

function isPublicOrderNumberCollision(error: unknown) {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== "P2002"
  ) {
    return false;
  }

  const target = error.meta?.target;
  return Array.isArray(target)
    ? target.includes("publicNumber")
    : String(target ?? "").includes("publicNumber");
}

function isRetryableOrderCreateError(error: unknown) {
  return (
    isPublicOrderNumberCollision(error) ||
    (error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2034")
  );
}

async function resolvePromocode(tx: Prisma.TransactionClient, input: {
  code: string;
  userId: string;
  restaurantId: string;
  itemsSubtotal: number;
  deliveryFee: number;
}) {
  if (!input.code) {
    return null;
  }

  const now = new Date();

  const lockedPromocodes = await tx.$queryRaw<{ id: string; }[]>`
    SELECT id
    FROM promocodes
    WHERE code = ${input.code.toUpperCase()}
    FOR UPDATE
  `;
  const lockedPromocode = lockedPromocodes[0];

  if (!lockedPromocode) {
    return null;
  }

  const promocode = await tx.promocode.findUnique({
    where: { id: lockedPromocode.id },
    include: {
      restaurants: true,
    },
  });

  if (!promocode || !promocode.isActive) {
    return null;
  }

  if (promocode.startsAt && promocode.startsAt > now) {
    return null;
  }

  if (promocode.endsAt && promocode.endsAt < now) {
    return null;
  }

  if (
    promocode.minOrderAmount !== null &&
    input.itemsSubtotal < promocode.minOrderAmount
  ) {
    return null;
  }

  if (
    promocode.restaurants.length > 0 &&
    !promocode.restaurants.some(
      (restaurant) => restaurant.restaurantId === input.restaurantId,
    )
  ) {
    return null;
  }

  const userRedemptions = await tx.promocodeRedemption.count({
    where: {
      promocodeId: promocode.id,
      userId: input.userId,
    },
  });
  const totalRedemptions = await tx.promocodeRedemption.count({
    where: { promocodeId: promocode.id },
  });

  if (
    promocode.perUserUsageLimit !== null &&
    userRedemptions >= promocode.perUserUsageLimit
  ) {
    return null;
  }

  if (
    promocode.totalUsageLimit !== null &&
    totalRedemptions >= promocode.totalUsageLimit
  ) {
    return null;
  }

  const discountAmount =
    promocode.discountType === "percent"
      ? Math.floor((input.itemsSubtotal * promocode.discountValue) / 10000)
      : promocode.discountType === "fixed_amount"
        ? promocode.discountValue
        : promocode.discountType === "free_delivery"
          ? input.deliveryFee
          : Math.min(promocode.discountValue, input.deliveryFee);

  return {
    id: promocode.id,
    discountAmount: Math.min(
      Math.max(discountAmount, 0),
      input.itemsSubtotal + input.deliveryFee,
    ),
  };
}

export async function createOrderAction(formData: FormData) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const addressId = readString(formData, "addressId");
  const paymentMethod = readString(formData, "paymentMethod");
  const customerComment = readString(formData, "customerComment");
  const promocodeInput = readString(formData, "promocode").toUpperCase();
  const cartPayload = readString(formData, "cartPayload");

  if (
    customerComment.length > MAX_CUSTOMER_COMMENT_LENGTH ||
    promocodeInput.length > MAX_PROMOCODE_LENGTH ||
    cartPayload.length > MAX_CART_PAYLOAD_LENGTH
  ) {
    redirect("/checkout?error=input_too_long");
  }

  const cartItems = parseCartPayload(cartPayload);

  if (!addressId) {
    redirect("/checkout?error=address_required");
  }

  if (paymentMethod !== "cash_to_courier") {
    redirect("/checkout?error=payment_unavailable");
  }

  if (cartItems.length === 0) {
    redirect("/checkout?error=empty_cart");
  }

  const restaurantId = getCartRestaurantId(cartItems);

  if (!restaurantId) {
    redirect("/checkout?error=single_restaurant_only");
  }

  const prisma = getPrisma();
  const quantities = new Map(
    cartItems.map((item) => [item.menuItemId, item.quantity]),
  );

  for (let attempt = 0; attempt < PUBLIC_ORDER_NUMBER_RETRY_COUNT; attempt += 1) {
    let result: CreateOrderTransactionResult | null = null;

    try {
      result = await prisma.$transaction(
        async (tx) => {
          const address = await tx.address.findFirst({
            where: {
              id: addressId,
              userId: user.id,
            },
          });

          if (!address) {
            return checkoutFailure("address_not_found");
          }

          const menuItems = await tx.menuItem.findMany({
            where: {
              id: {
                in: cartItems.map((item) => item.menuItemId),
              },
              restaurantId,
              isActive: true,
              isAvailable: true,
            },
            include: {
              translations: true,
              restaurant: {
                include: {
                  translations: true,
                },
              },
            },
          });

          if (menuItems.length !== cartItems.length) {
            return checkoutFailure("cart_changed");
          }

          const restaurant = menuItems[0]?.restaurant;

          if (!restaurant || restaurant.id !== restaurantId) {
            return checkoutFailure("cart_changed");
          }

          if (restaurant.status !== "active") {
            return checkoutFailure("restaurant_unavailable");
          }

          if (menuItems.some((item) => item.restaurantId !== restaurantId)) {
            return checkoutFailure("single_restaurant_only");
          }

          const restaurantLat = toNumber(restaurant.latitude);
          const restaurantLng = toNumber(restaurant.longitude);
          const customerLat = toNumber(address.latitude);
          const customerLng = toNumber(address.longitude);

          if (
            restaurantLat === null ||
            restaurantLng === null ||
            customerLat === null ||
            customerLng === null
          ) {
            return checkoutFailure("missing_coordinates");
          }

          const distanceMeters = calculateDistanceMeters(
            { latitude: restaurantLat, longitude: restaurantLng },
            { latitude: customerLat, longitude: customerLng },
          );

          if (
            restaurant.deliveryRadiusMeters !== null &&
            distanceMeters > restaurant.deliveryRadiusMeters
          ) {
            return checkoutFailure("outside_radius");
          }

          const deliveryRule = await tx.deliveryPricingRule.findFirst({
            where: { isActive: true },
            orderBy: { createdAt: "asc" },
          });

          if (!deliveryRule) {
            return checkoutFailure("delivery_rule_missing");
          }

          const deliveryFee = calculateDeliveryFee({
            distanceMeters,
            baseFee: deliveryRule.baseFee,
            perKmFee: deliveryRule.perKmFee,
            minFee: deliveryRule.minFee,
            maxFee: deliveryRule.maxFee,
          });

          const itemsSubtotal = menuItems.reduce((sum, item) => {
            return sum + item.price * (quantities.get(item.id) ?? 0);
          }, 0);

          if (itemsSubtotal < restaurant.minimumOrderAmount) {
            return checkoutFailure("minimum_order");
          }

          const serviceRule = await tx.serviceFeeRule.findFirst({
            where: {
              isActive: true,
              OR: [
                { minOrderAmount: null },
                { minOrderAmount: { lte: itemsSubtotal } },
              ],
            },
            orderBy: { createdAt: "asc" },
          });

          const rawServiceFee = serviceRule
            ? serviceRule.fixedFee +
              Math.floor((itemsSubtotal * serviceRule.percentBps) / 10000)
            : 0;
          const serviceFee = Math.min(
            rawServiceFee,
            serviceRule?.maxFee ?? rawServiceFee,
          );
          const promocode = await resolvePromocode(tx, {
            code: promocodeInput,
            userId: user.id,
            restaurantId,
            itemsSubtotal,
            deliveryFee,
          });
          const discountTotal = promocode?.discountAmount ?? 0;
          const customerTotal =
            itemsSubtotal + deliveryFee + serviceFee - discountTotal;
          const restaurantCommission = Math.floor(
            (itemsSubtotal * restaurant.defaultCommissionBps) / 10000,
          );
          const restaurantPayout = itemsSubtotal - restaurantCommission;
          const courierEarning = deliveryFee;
          const platformRevenue =
            restaurantCommission + serviceFee + deliveryFee - courierEarning;
          const publicNumber = createPublicOrderNumber();

          const order = await tx.order.create({
          data: {
            publicNumber,
            customerId: user.id,
            restaurantId,
            status: "pending_confirmation",
            paymentMethod: "cash_to_courier",
            paymentStatus: "pending",
            customerComment: customerComment || null,
            items: {
              create: menuItems.map((item) => {
                const translation = item.translations.find(
                  (itemTranslation) => itemTranslation.language === "ru",
                );
                const quantity = quantities.get(item.id) ?? 0;

                return {
                  menuItemId: item.id,
                  nameSnapshot: translation?.name ?? "Блюдо",
                  descriptionSnapshot: translation?.description,
                  unitPrice: item.price,
                  quantity,
                  totalPrice: item.price * quantity,
                  currency: item.currency,
                };
              }),
            },
            deliveryAddress: {
              create: {
                nameSnapshot: user.name ?? user.phone,
                phoneSnapshot: user.phone,
                city: address.city,
                addressLine: address.addressLine,
                street: address.street,
                house: address.house,
                apartment: address.apartment,
                entrance: address.entrance,
                floor: address.floor,
                intercom: address.intercom,
                comment: address.comment,
                latitude: address.latitude,
                longitude: address.longitude,
              },
            },
            financials: {
              create: {
                itemsSubtotal,
                deliveryFee,
                serviceFee,
                discountTotal,
                customerTotal,
                restaurantCommission,
                restaurantPayout,
                courierEarning,
                platformRevenue,
                currency: "KZT",
              },
            },
            deliveryFeeCalculation: {
              create: {
                restaurantLatitude: restaurant.latitude,
                restaurantLongitude: restaurant.longitude,
                customerLatitude: address.latitude,
                customerLongitude: address.longitude,
                distanceMeters,
                baseFee: deliveryRule.baseFee,
                perKmFee: deliveryRule.perKmFee,
                minFee: deliveryRule.minFee,
                maxFee: deliveryRule.maxFee,
                finalFee: deliveryFee,
                currency: "KZT",
                source: "haversine",
              },
            },
            delivery: {
              create: {
                status: "pending_assignment",
              },
            },
            payments: {
              create: [
                {
                  method: "cash_to_courier",
                  status: "pending",
                  amount: customerTotal,
                  currency: "KZT",
                  provider: "dev",
                },
              ],
            },
            statusHistory: {
              create: [
                {
                  fromStatus: null,
                  toStatus: "pending_confirmation",
                  changedByUserId: user.id,
                  comment: "Заказ создан клиентом.",
                },
              ],
            },
            promoRedemptions: promocode
              ? {
                create: [
                  {
                    promocodeId: promocode.id,
                    userId: user.id,
                    discountAmount: promocode.discountAmount,
                  },
                ],
              }
              : undefined,
          },
        });

          return {
            status: "created" as const,
            publicNumber: order.publicNumber,
          };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      );
    } catch (error) {
      if (isRetryableOrderCreateError(error)) {
        continue;
      }

      throw error;
    }

    if (!result) {
      continue;
    }

    if (result.status === "failed") {
      redirectCheckoutError(result.error);
    }

    redirect(`/orders/${result.publicNumber}?created=1`);
  }

  redirect("/checkout?error=order_number_collision");
}
