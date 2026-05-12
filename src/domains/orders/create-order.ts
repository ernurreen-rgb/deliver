"use server";

import { randomBytes } from "node:crypto";
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

type ParsedCartItem = {
  menuItemId: string;
  quantity: number;
};

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

function createPublicOrderNumber() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const suffix = randomBytes(3).toString("hex").toUpperCase();

  return `A-${timestamp}-${suffix}`;
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

  const [userRedemptions, totalRedemptions] = await Promise.all([
    tx.promocodeRedemption.count({
      where: {
        promocodeId: promocode.id,
        userId: input.userId,
      },
    }),
    tx.promocodeRedemption.count({
      where: { promocodeId: promocode.id },
    }),
  ]);

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

  const prisma = getPrisma();
  const address = await prisma.address.findFirst({
    where: {
      id: addressId,
      userId: user.id,
    },
  });

  if (!address) {
    redirect("/checkout?error=address_not_found");
  }

  const menuItems = await prisma.menuItem.findMany({
    where: {
      id: {
        in: cartItems.map((item) => item.menuItemId),
      },
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
    redirect("/checkout?error=cart_changed");
  }

  const restaurantId = menuItems[0]?.restaurantId;
  const restaurant = menuItems[0]?.restaurant;

  if (!restaurantId || !restaurant) {
    redirect("/checkout?error=cart_changed");
  }

  if (restaurant.status !== "active") {
    redirect("/checkout?error=restaurant_unavailable");
  }

  if (menuItems.some((item) => item.restaurantId !== restaurantId)) {
    redirect("/checkout?error=single_restaurant_only");
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
    redirect("/checkout?error=missing_coordinates");
  }

  const distanceMeters = calculateDistanceMeters(
    { latitude: restaurantLat, longitude: restaurantLng },
    { latitude: customerLat, longitude: customerLng },
  );

  if (
    restaurant.deliveryRadiusMeters !== null &&
    distanceMeters > restaurant.deliveryRadiusMeters
  ) {
    redirect("/checkout?error=outside_radius");
  }

  const deliveryRule = await prisma.deliveryPricingRule.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
  });

  if (!deliveryRule) {
    redirect("/checkout?error=delivery_rule_missing");
  }

  const deliveryFee = calculateDeliveryFee({
    distanceMeters,
    baseFee: deliveryRule.baseFee,
    perKmFee: deliveryRule.perKmFee,
    minFee: deliveryRule.minFee,
    maxFee: deliveryRule.maxFee,
  });

  const quantities = new Map(
    cartItems.map((item) => [item.menuItemId, item.quantity]),
  );
  const itemsSubtotal = menuItems.reduce((sum, item) => {
    return sum + item.price * (quantities.get(item.id) ?? 0);
  }, 0);

  if (itemsSubtotal < restaurant.minimumOrderAmount) {
    redirect("/checkout?error=minimum_order");
  }

  const serviceRule = await prisma.serviceFeeRule.findFirst({
    where: {
      isActive: true,
      OR: [{ minOrderAmount: null }, { minOrderAmount: { lte: itemsSubtotal } }],
    },
    orderBy: { createdAt: "asc" },
  });

  const rawServiceFee = serviceRule
    ? serviceRule.fixedFee +
    Math.floor((itemsSubtotal * serviceRule.percentBps) / 10000)
    : 0;
  const serviceFee = Math.min(rawServiceFee, serviceRule?.maxFee ?? rawServiceFee);

  for (let attempt = 0; attempt < PUBLIC_ORDER_NUMBER_RETRY_COUNT; attempt += 1) {
    try {
      const order = await prisma.$transaction(async (tx) => {
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

        return tx.order.create({
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
      });

      redirect(`/orders/${order.publicNumber}?created=1`);
    } catch (error) {
      if (isPublicOrderNumberCollision(error)) {
        continue;
      }

      throw error;
    }
  }

  redirect("/checkout?error=order_number_collision");
}
