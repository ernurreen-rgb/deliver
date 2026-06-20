import type {
  CartQuote,
  CartQuoteRequest,
  CreateCashOrderRequest,
  OrderStatusEvent,
  OrderStatusResponse,
} from "@deliver/contracts/orders";
import type { AuthUser } from "@deliver/contracts/auth";
import { Prisma } from "@/generated/prisma/client";
import {
  calculateDeliveryFee,
  calculateDistanceMeters,
  toNumber,
} from "@/domains/delivery/pricing";
import { createPublicOrderNumber } from "@/domains/orders/public-number";
import { getOrderStatusLabel } from "@/domains/orders/queries";
import { sha256 } from "@/domains/auth/crypto";
import { getPrisma } from "@/lib/db/prisma";

export type CustomerApiOrderError =
  | "address_required"
  | "cart_changed"
  | "checkout_request_conflict"
  | "delivery_rule_missing"
  | "empty_cart"
  | "idempotency_key_required"
  | "input_too_long"
  | "invalid_address"
  | "minimum_order"
  | "missing_coordinates"
  | "order_number_collision"
  | "outside_radius"
  | "restaurant_unavailable";

type QuotePrismaClient = Pick<
  Prisma.TransactionClient,
  "deliveryPricingRule" | "menuItem" | "serviceFeeRule"
>;

type QuoteSuccess = {
  status: "quoted";
  quote: CartQuote;
  distanceMeters: number;
  restaurant: {
    id: string;
    slug: string;
    latitude: Prisma.Decimal | null;
    longitude: Prisma.Decimal | null;
    minimumOrderAmount: number;
    defaultCommissionBps: number;
  };
  deliveryRule: {
    baseFee: number;
    perKmFee: number;
    minFee: number | null;
    maxFee: number | null;
  };
  menuItems: {
    id: string;
    price: number;
    currency: string;
    translations: { language: string; name: string; description: string | null }[];
  }[];
};

type QuoteResult = QuoteSuccess | { status: "failed"; error: CustomerApiOrderError };

type CreateCashOrderResult =
  | { status: "created"; order: OrderStatusResponse }
  | { status: "failed"; error: CustomerApiOrderError };

const MAX_IDEMPOTENCY_KEY_LENGTH = 128;
const MAX_CUSTOMER_COMMENT_LENGTH = 500;
const MAX_ADDRESS_TEXT_LENGTH = 500;
const PUBLIC_ORDER_NUMBER_RETRY_COUNT = 3;

function getQuantityByMenuItemId(items: CartQuoteRequest["items"]) {
  return new Map(items.map((item) => [item.menuItemId, item.quantity]));
}

function hasValidAddress(input: CartQuoteRequest["deliveryAddress"]) {
  return (
    input.addressLine.trim().length > 0 &&
    input.addressLine.length <= MAX_ADDRESS_TEXT_LENGTH &&
    Number.isFinite(input.latitude) &&
    input.latitude >= -90 &&
    input.latitude <= 90 &&
    Number.isFinite(input.longitude) &&
    input.longitude >= -180 &&
    input.longitude <= 180
  );
}

function getStablePayloadHash(input: CreateCashOrderRequest) {
  return sha256(
    JSON.stringify({
      restaurantId: input.restaurantId,
      items: input.items
        .map((item) => ({
          menuItemId: item.menuItemId,
          quantity: item.quantity,
        }))
        .sort((first, second) =>
          first.menuItemId.localeCompare(second.menuItemId),
        ),
      deliveryAddress: {
        label: input.deliveryAddress.label?.trim() || null,
        addressLine: input.deliveryAddress.addressLine.trim(),
        apartment: input.deliveryAddress.apartment?.trim() || null,
        entrance: input.deliveryAddress.entrance?.trim() || null,
        floor: input.deliveryAddress.floor?.trim() || null,
        comment: input.deliveryAddress.comment?.trim() || null,
        latitude: input.deliveryAddress.latitude,
        longitude: input.deliveryAddress.longitude,
      },
      customerComment: input.customerComment?.trim() || null,
    }),
  );
}

function buildCheckoutRequestKey(input: {
  customerId: string;
  idempotencyKey: string;
}) {
  return `api:v1:cash:${input.customerId}:${input.idempotencyKey}`;
}

async function calculateCashCartQuote(
  prisma: QuotePrismaClient,
  input: CartQuoteRequest,
): Promise<QuoteResult> {
  if (input.items.length === 0) {
    return { status: "failed", error: "empty_cart" };
  }

  if (!hasValidAddress(input.deliveryAddress)) {
    return { status: "failed", error: "invalid_address" };
  }

  const quantities = getQuantityByMenuItemId(input.items);
  const menuItems = await prisma.menuItem.findMany({
    where: {
      id: {
        in: input.items.map((item) => item.menuItemId),
      },
      restaurantId: input.restaurantId,
      isActive: true,
      isAvailable: true,
    },
    include: {
      translations: true,
      restaurant: true,
    },
  });

  if (menuItems.length !== input.items.length) {
    return { status: "failed", error: "cart_changed" };
  }

  const restaurant = menuItems[0]?.restaurant;

  if (!restaurant || restaurant.id !== input.restaurantId) {
    return { status: "failed", error: "cart_changed" };
  }

  if (restaurant.status !== "active") {
    return { status: "failed", error: "restaurant_unavailable" };
  }

  if (menuItems.some((item) => item.restaurantId !== input.restaurantId)) {
    return { status: "failed", error: "cart_changed" };
  }

  const restaurantLat = toNumber(restaurant.latitude);
  const restaurantLng = toNumber(restaurant.longitude);

  if (restaurantLat === null || restaurantLng === null) {
    return { status: "failed", error: "missing_coordinates" };
  }

  const distanceMeters = calculateDistanceMeters(
    { latitude: restaurantLat, longitude: restaurantLng },
    {
      latitude: input.deliveryAddress.latitude,
      longitude: input.deliveryAddress.longitude,
    },
  );

  if (
    restaurant.deliveryRadiusMeters !== null &&
    distanceMeters > restaurant.deliveryRadiusMeters
  ) {
    return { status: "failed", error: "outside_radius" };
  }

  const deliveryRule = await prisma.deliveryPricingRule.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
  });

  if (!deliveryRule) {
    return { status: "failed", error: "delivery_rule_missing" };
  }

  const deliveryFee = calculateDeliveryFee({
    distanceMeters,
    baseFee: deliveryRule.baseFee,
    perKmFee: deliveryRule.perKmFee,
    minFee: deliveryRule.minFee,
    maxFee: deliveryRule.maxFee,
  });
  const itemsSubtotal = menuItems.reduce(
    (sum, item) => sum + item.price * (quantities.get(item.id) ?? 0),
    0,
  );

  if (itemsSubtotal < restaurant.minimumOrderAmount) {
    return { status: "failed", error: "minimum_order" };
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
  const total = itemsSubtotal + deliveryFee + serviceFee;

  return {
    status: "quoted",
    quote: {
      itemsSubtotal,
      deliveryFee,
      serviceFee,
      total,
      currency: "KZT",
    },
    distanceMeters,
    restaurant,
    deliveryRule,
    menuItems,
  };
}

function isRetryableOrderCreateError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2002" || error.code === "P2034")
  );
}

export async function quoteCashCart(
  input: CartQuoteRequest,
): Promise<QuoteResult> {
  return calculateCashCartQuote(getPrisma(), input);
}

export async function getApiOrderStatus(input: {
  customerId: string;
  publicNumber: string;
}) {
  const order = await getPrisma().order.findFirst({
    where: {
      customerId: input.customerId,
      publicNumber: input.publicNumber,
    },
    include: {
      financials: true,
      restaurant: {
        include: {
          translations: true,
        },
      },
      statusHistory: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!order) {
    return null;
  }

  const restaurantRu = order.restaurant.translations.find(
    (translation) => translation.language === "ru",
  );
  const events: OrderStatusEvent[] = order.statusHistory.map((event) => ({
    status: event.toStatus,
    label: getOrderStatusLabel(event.toStatus),
    occurredAt: event.createdAt.toISOString(),
  }));

  return {
    id: order.id,
    number: order.publicNumber,
    restaurantId: order.restaurantId,
    restaurantName: restaurantRu?.name ?? order.restaurant.slug,
    status: order.status,
    statusLabel: getOrderStatusLabel(order.status),
    total: order.financials?.customerTotal ?? 0,
    currency: "KZT",
    createdAt: order.createdAt.toISOString(),
    events,
  } satisfies OrderStatusResponse;
}

async function findExistingApiOrder(input: {
  checkoutRequestKey: string;
  checkoutPayloadHash: string;
  customerId: string;
}): Promise<CreateCashOrderResult | null> {
  const existing = await getPrisma().order.findFirst({
    where: {
      checkoutRequestKey: input.checkoutRequestKey,
      customerId: input.customerId,
    },
    select: {
      publicNumber: true,
      checkoutPayloadHash: true,
    },
  });

  if (!existing) {
    return null;
  }

  if (existing.checkoutPayloadHash !== input.checkoutPayloadHash) {
    return { status: "failed", error: "checkout_request_conflict" };
  }

  const order = await getApiOrderStatus({
    customerId: input.customerId,
    publicNumber: existing.publicNumber,
  });

  return order
    ? { status: "created", order }
    : { status: "failed", error: "checkout_request_conflict" };
}

export async function createCashOrderForCustomer(input: {
  customer: Pick<AuthUser, "id" | "name" | "phone">;
  order: CreateCashOrderRequest;
}): Promise<CreateCashOrderResult> {
  const idempotencyKey = input.order.idempotencyKey.trim();
  const customerComment = input.order.customerComment?.trim() ?? "";

  if (!idempotencyKey || idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    return { status: "failed", error: "idempotency_key_required" };
  }

  if (
    customerComment.length > MAX_CUSTOMER_COMMENT_LENGTH ||
    (input.order.deliveryAddress.comment?.length ?? 0) > MAX_ADDRESS_TEXT_LENGTH
  ) {
    return { status: "failed", error: "input_too_long" };
  }

  const checkoutRequestKey = buildCheckoutRequestKey({
    customerId: input.customer.id,
    idempotencyKey,
  });
  const checkoutPayloadHash = getStablePayloadHash(input.order);
  const duplicate = await findExistingApiOrder({
    checkoutRequestKey,
    checkoutPayloadHash,
    customerId: input.customer.id,
  });

  if (duplicate) {
    return duplicate;
  }

  for (let attempt = 0; attempt < PUBLIC_ORDER_NUMBER_RETRY_COUNT; attempt += 1) {
    try {
      const transactionResult = await getPrisma().$transaction(
        async (tx) => {
          const existing = await tx.order.findFirst({
            where: {
              checkoutRequestKey,
              customerId: input.customer.id,
            },
            select: {
              publicNumber: true,
              checkoutPayloadHash: true,
            },
          });

          if (existing) {
            if (existing.checkoutPayloadHash !== checkoutPayloadHash) {
              return { status: "conflict" as const };
            }

            return { status: "existing" as const, publicNumber: existing.publicNumber };
          }

          const quote = await calculateCashCartQuote(tx, input.order);

          if (quote.status === "failed") {
            return quote;
          }

          const quantities = getQuantityByMenuItemId(input.order.items);
          const restaurantCommission = Math.floor(
            (quote.quote.itemsSubtotal * quote.restaurant.defaultCommissionBps) /
              10000,
          );
          const restaurantPayout = quote.quote.itemsSubtotal - restaurantCommission;
          const courierEarning = quote.quote.deliveryFee;
          const platformRevenue =
            restaurantCommission +
            quote.quote.serviceFee +
            quote.quote.deliveryFee -
            courierEarning;
          const publicNumber = createPublicOrderNumber();
          const order = await tx.order.create({
            data: {
              publicNumber,
              customerId: input.customer.id,
              restaurantId: input.order.restaurantId,
              status: "pending_confirmation",
              paymentMethod: "cash_to_courier",
              paymentStatus: "pending",
              checkoutRequestKey,
              checkoutPayloadHash,
              customerComment: customerComment || null,
              items: {
                create: quote.menuItems.map((item) => {
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
                  nameSnapshot: input.customer.name ?? input.customer.phone,
                  phoneSnapshot: input.customer.phone,
                  city: "Алматы",
                  addressLine: input.order.deliveryAddress.addressLine.trim(),
                  apartment: input.order.deliveryAddress.apartment?.trim() || null,
                  entrance: input.order.deliveryAddress.entrance?.trim() || null,
                  floor: input.order.deliveryAddress.floor?.trim() || null,
                  comment: input.order.deliveryAddress.comment?.trim() || null,
                  latitude: input.order.deliveryAddress.latitude,
                  longitude: input.order.deliveryAddress.longitude,
                },
              },
              financials: {
                create: {
                  itemsSubtotal: quote.quote.itemsSubtotal,
                  deliveryFee: quote.quote.deliveryFee,
                  serviceFee: quote.quote.serviceFee,
                  discountTotal: 0,
                  customerTotal: quote.quote.total,
                  restaurantCommission,
                  restaurantPayout,
                  courierEarning,
                  platformRevenue,
                  currency: "KZT",
                },
              },
              deliveryFeeCalculation: {
                create: {
                  restaurantLatitude: quote.restaurant.latitude,
                  restaurantLongitude: quote.restaurant.longitude,
                  customerLatitude: input.order.deliveryAddress.latitude,
                  customerLongitude: input.order.deliveryAddress.longitude,
                  distanceMeters: quote.distanceMeters,
                  baseFee: quote.deliveryRule.baseFee,
                  perKmFee: quote.deliveryRule.perKmFee,
                  minFee: quote.deliveryRule.minFee,
                  maxFee: quote.deliveryRule.maxFee,
                  finalFee: quote.quote.deliveryFee,
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
                    amount: quote.quote.total,
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
                    changedByUserId: input.customer.id,
                    comment: "Заказ создан клиентом через JSON API.",
                  },
                ],
              },
            },
          });

          return { status: "created" as const, publicNumber: order.publicNumber };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      );

      if (transactionResult.status === "conflict") {
        return { status: "failed", error: "checkout_request_conflict" };
      }

      if (transactionResult.status === "failed") {
        return transactionResult;
      }

      const order = await getApiOrderStatus({
        customerId: input.customer.id,
        publicNumber: transactionResult.publicNumber,
      });

      return order
        ? { status: "created", order }
        : { status: "failed", error: "checkout_request_conflict" };
    } catch (error) {
      if (!isRetryableOrderCreateError(error)) {
        throw error;
      }

      const duplicateAfterCollision = await findExistingApiOrder({
        checkoutRequestKey,
        checkoutPayloadHash,
        customerId: input.customer.id,
      });

      if (duplicateAfterCollision) {
        return duplicateAfterCollision;
      }
    }
  }

  return { status: "failed", error: "order_number_collision" };
}
