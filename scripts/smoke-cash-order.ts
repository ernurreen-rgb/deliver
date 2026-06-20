import "dotenv/config";
import { pathToFileURL } from "node:url";
import { Prisma } from "@/generated/prisma/client";
import { acceptCourierOfferForUser, dispatchNextCourierOffer } from "@/domains/delivery/dispatch";
import {
  calculateDeliveryFee,
  calculateDistanceMeters,
  toNumber,
} from "@/domains/delivery/pricing";
import { transitionCourierDeliveryForUser } from "@/domains/delivery/lifecycle";
import { createPublicOrderNumber } from "@/domains/orders/public-number";
import {
  getOperatorOrders,
  getOperatorPilotJournal,
} from "@/domains/orders/queries";
import { writeAuditLog } from "@/domains/audit/log";
import { getPrisma } from "@/lib/db/prisma";
import { getReleaseTarget } from "@/lib/release-env";
import {
  ACTIVE_SMOKE_DELIVERY_STATUSES,
  prepareSmokeFixturesForRerun,
  SMOKE_COURIER_PHONE,
  SMOKE_CUSTOMER_PHONE,
  SMOKE_ORDER_COMMENT_PREFIX,
  SMOKE_RESTAURANT_SLUG,
} from "./lib/smoke-fixture-reset";

const CUSTOMER_PHONE = SMOKE_CUSTOMER_PHONE;
const RESTAURANT_STAFF_PHONE = "+77000000001";
const COURIER_PHONE = SMOKE_COURIER_PHONE;
const RESTAURANT_SLUG = SMOKE_RESTAURANT_SLUG;
const SMOKE_COMMENT = SMOKE_ORDER_COMMENT_PREFIX;
const PUBLIC_ORDER_NUMBER_RETRY_COUNT = 3;
const SMOKE_ALLOW_STAGING_WRITE_ENV = "SMOKE_ALLOW_STAGING_WRITE";
const SMOKE_ALLOW_PRODUCTION_WRITE_ENV = "SMOKE_ALLOW_PRODUCTION_WRITE";
const LOCAL_DATABASE_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const POSTGRES_HOST_OVERRIDE_PARAMS = new Set(["host", "hostaddr"]);

type SmokeOrder = {
  id: string;
  publicNumber: string;
  deliveryId: string;
  total: number;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function requireLocalSmokeDatabase() {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  assert(databaseUrl, "DATABASE_URL is required before creating smoke orders.");

  const url = new URL(databaseUrl);
  const isPostgres = url.protocol === "postgresql:" || url.protocol === "postgres:";
  const databaseName = url.pathname.replace(/^\//, "");
  const hostOverride = Array.from(url.searchParams.keys()).find((key) =>
    POSTGRES_HOST_OVERRIDE_PARAMS.has(key.toLowerCase()),
  );

  assert(isPostgres, "Local smoke requires a PostgreSQL DATABASE_URL.");
  assert(
    !hostOverride,
    `Local smoke refuses DATABASE_URL query parameter "${hostOverride}" because it can override the checked host or select a socket path.`,
  );
  assert(
    LOCAL_DATABASE_HOSTS.has(url.hostname),
    "Local smoke refuses to write unless DATABASE_URL uses localhost, 127.0.0.1 or ::1.",
  );
  assert(
    databaseName === "deliver",
    `Local smoke refuses to write to database "${databaseName}". Expected "deliver".`,
  );
}

function assertSmokeWritesAllowed() {
  const releaseTarget = getReleaseTarget(process.env);

  assert(
    releaseTarget,
    "RELEASE_TARGET must be one of: local, staging, production before creating smoke orders.",
  );

  if (releaseTarget === "local") {
    requireLocalSmokeDatabase();
    return;
  }

  if (
    releaseTarget === "staging" &&
    process.env[SMOKE_ALLOW_STAGING_WRITE_ENV] !== "1"
  ) {
    throw new Error(
      `${SMOKE_ALLOW_STAGING_WRITE_ENV}=1 is required before creating smoke orders with RELEASE_TARGET=staging.`,
    );
  }

  if (
    releaseTarget === "production" &&
    process.env[SMOKE_ALLOW_PRODUCTION_WRITE_ENV] !== "1"
  ) {
    throw new Error(
      `${SMOKE_ALLOW_PRODUCTION_WRITE_ENV}=1 is required before creating smoke orders with RELEASE_TARGET=production.`,
    );
  }
}

async function requireFixtures() {
  const prisma = getPrisma();

  const [customer, restaurantStaff, courierUser, restaurant] = await Promise.all([
    prisma.user.findUnique({
      where: { phone: CUSTOMER_PHONE },
      include: { addresses: true },
    }),
    prisma.user.findUnique({
      where: { phone: RESTAURANT_STAFF_PHONE },
    }),
    prisma.user.findUnique({
      where: { phone: COURIER_PHONE },
      include: {
        courier: {
          include: {
            availability: true,
          },
        },
      },
    }),
    prisma.restaurant.findUnique({
      where: { slug: RESTAURANT_SLUG },
      include: {
        menuItems: {
          where: {
            isActive: true,
            isAvailable: true,
          },
          include: {
            translations: true,
          },
          orderBy: { sortOrder: "asc" },
          take: 1,
        },
      },
    }),
  ]);

  assert(customer, `Missing smoke customer ${CUSTOMER_PHONE}. Run npm run db:seed.`);
  assert(customer.addresses.length > 0, "Smoke customer has no delivery address.");
  assert(restaurantStaff, `Missing smoke restaurant staff ${RESTAURANT_STAFF_PHONE}.`);
  assert(courierUser, `Missing smoke courier user ${COURIER_PHONE}.`);
  assert(courierUser.courier, "Smoke courier profile is missing.");
  assert(courierUser.courier.availability, "Smoke courier availability is missing.");
  assert(restaurant, `Missing smoke restaurant ${RESTAURANT_SLUG}.`);
  assert(restaurant.status === "active", "Smoke restaurant is not active.");
  assert(restaurant.menuItems.length > 0, "Smoke restaurant has no available menu item.");

  const courier = courierUser.courier;
  const courierAvailability = courier.availability;
  const menuItem = restaurant.menuItems[0];
  assert(courierAvailability, "Smoke courier availability is missing.");

  const activeDeliveries = await prisma.delivery.findMany({
    where: {
      courierId: courier.id,
      status: { in: [...ACTIVE_SMOKE_DELIVERY_STATUSES] },
    },
    include: {
      order: {
        select: { publicNumber: true, status: true },
      },
    },
  });

  assert(
    activeDeliveries.length === 0,
    `Smoke courier has active deliveries: ${activeDeliveries
      .map((delivery) => `${delivery.order.publicNumber}:${delivery.status}`)
      .join(", ")}`,
  );

  assert(
    courier.status === "available" &&
      courierAvailability.status === "available",
    "Smoke courier must be available before running the smoke.",
  );

  return {
    address: customer.addresses[0],
    customer,
    courier,
    courierUser,
    menuItem,
    restaurant,
    restaurantStaff,
  };
}

async function createSmokeOrder(): Promise<SmokeOrder> {
  const prisma = getPrisma();
  const fixtures = await requireFixtures();
  const quantity = 1;

  for (let attempt = 0; attempt < PUBLIC_ORDER_NUMBER_RETRY_COUNT; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const restaurantLat = toNumber(fixtures.restaurant.latitude);
          const restaurantLng = toNumber(fixtures.restaurant.longitude);
          const customerLat = toNumber(fixtures.address.latitude);
          const customerLng = toNumber(fixtures.address.longitude);

          assert(restaurantLat !== null, "Restaurant latitude is missing.");
          assert(restaurantLng !== null, "Restaurant longitude is missing.");
          assert(customerLat !== null, "Customer latitude is missing.");
          assert(customerLng !== null, "Customer longitude is missing.");

          const distanceMeters = calculateDistanceMeters(
            { latitude: restaurantLat, longitude: restaurantLng },
            { latitude: customerLat, longitude: customerLng },
          );

          if (
            fixtures.restaurant.deliveryRadiusMeters !== null &&
            distanceMeters > fixtures.restaurant.deliveryRadiusMeters
          ) {
            throw new Error("Smoke address is outside restaurant delivery radius.");
          }

          const deliveryRule = await tx.deliveryPricingRule.findFirst({
            where: { isActive: true },
            orderBy: { createdAt: "asc" },
          });
          assert(deliveryRule, "Active delivery pricing rule is missing.");

          const serviceRule = await tx.serviceFeeRule.findFirst({
            where: {
              isActive: true,
              OR: [
                { minOrderAmount: null },
                { minOrderAmount: { lte: fixtures.menuItem.price * quantity } },
              ],
            },
            orderBy: { createdAt: "asc" },
          });

          const itemsSubtotal = fixtures.menuItem.price * quantity;
          assert(
            itemsSubtotal >= fixtures.restaurant.minimumOrderAmount,
            "Smoke menu item is below restaurant minimum order amount.",
          );

          const deliveryFee = calculateDeliveryFee({
            distanceMeters,
            baseFee: deliveryRule.baseFee,
            perKmFee: deliveryRule.perKmFee,
            minFee: deliveryRule.minFee,
            maxFee: deliveryRule.maxFee,
          });
          const rawServiceFee = serviceRule
            ? serviceRule.fixedFee +
              Math.floor((itemsSubtotal * serviceRule.percentBps) / 10000)
            : 0;
          const serviceFee = Math.min(
            rawServiceFee,
            serviceRule?.maxFee ?? rawServiceFee,
          );
          const discountTotal = 0;
          const customerTotal =
            itemsSubtotal + deliveryFee + serviceFee - discountTotal;
          const restaurantCommission = Math.floor(
            (itemsSubtotal * fixtures.restaurant.defaultCommissionBps) / 10000,
          );
          const restaurantPayout = itemsSubtotal - restaurantCommission;
          const courierEarning = deliveryFee;
          const platformRevenue =
            restaurantCommission + serviceFee + deliveryFee - courierEarning;
          const translation = fixtures.menuItem.translations.find(
            (itemTranslation) => itemTranslation.language === "ru",
          );

          const order = await tx.order.create({
            data: {
              publicNumber: createPublicOrderNumber(),
              customerId: fixtures.customer.id,
              restaurantId: fixtures.restaurant.id,
              status: "pending_confirmation",
              paymentMethod: "cash_to_courier",
              paymentStatus: "pending",
              customerComment: `${SMOKE_COMMENT} ${new Date().toISOString()}`,
              items: {
                create: [
                  {
                    menuItemId: fixtures.menuItem.id,
                    nameSnapshot: translation?.name ?? "Smoke item",
                    descriptionSnapshot: translation?.description,
                    unitPrice: fixtures.menuItem.price,
                    quantity,
                    totalPrice: fixtures.menuItem.price * quantity,
                    currency: fixtures.menuItem.currency,
                  },
                ],
              },
              deliveryAddress: {
                create: {
                  nameSnapshot: fixtures.customer.name ?? fixtures.customer.phone,
                  phoneSnapshot: fixtures.customer.phone,
                  city: fixtures.address.city,
                  addressLine: fixtures.address.addressLine,
                  street: fixtures.address.street,
                  house: fixtures.address.house,
                  apartment: fixtures.address.apartment,
                  entrance: fixtures.address.entrance,
                  floor: fixtures.address.floor,
                  intercom: fixtures.address.intercom,
                  comment: fixtures.address.comment,
                  latitude: fixtures.address.latitude,
                  longitude: fixtures.address.longitude,
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
                  restaurantLatitude: fixtures.restaurant.latitude,
                  restaurantLongitude: fixtures.restaurant.longitude,
                  customerLatitude: fixtures.address.latitude,
                  customerLongitude: fixtures.address.longitude,
                  distanceMeters,
                  baseFee: deliveryRule.baseFee,
                  perKmFee: deliveryRule.perKmFee,
                  minFee: deliveryRule.minFee,
                  maxFee: deliveryRule.maxFee,
                  finalFee: deliveryFee,
                  currency: "KZT",
                  source: "smoke",
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
                    changedByUserId: fixtures.customer.id,
                    comment: "Smoke order created.",
                  },
                ],
              },
            },
            include: {
              delivery: true,
              financials: true,
            },
          });

          assert(order.delivery, "Smoke order delivery was not created.");
          assert(order.financials, "Smoke order financials were not created.");

          return {
            id: order.id,
            publicNumber: order.publicNumber,
            deliveryId: order.delivery.id,
            total: order.financials.customerTotal,
          };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        continue;
      }

      throw error;
    }
  }

  throw new Error("Could not create a unique public order number.");
}

async function transitionRestaurantOrder(input: {
  actorUserId: string;
  fromStatus: "pending_confirmation" | "accepted" | "preparing";
  orderId: string;
  toStatus: "accepted" | "preparing" | "ready_for_pickup";
  comment: string;
}) {
  const prisma = getPrisma();
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const updated = await tx.order.updateMany({
      where: {
        id: input.orderId,
        status: input.fromStatus,
      },
      data: {
        status: input.toStatus,
        acceptedAt: input.toStatus === "accepted" ? now : undefined,
        restaurantComment: input.toStatus === "accepted" ? input.comment : undefined,
      },
    });

    assert(
      updated.count === 1,
      `Order did not transition from ${input.fromStatus} to ${input.toStatus}.`,
    );

    await tx.orderStatusHistory.create({
      data: {
        orderId: input.orderId,
        fromStatus: input.fromStatus,
        toStatus: input.toStatus,
        changedByUserId: input.actorUserId,
        comment: input.comment,
      },
    });

    await writeAuditLog({
      tx,
      actorUserId: input.actorUserId,
      entityType: "order",
      entityId: input.orderId,
      action: `smoke_restaurant_${input.toStatus}_v1`,
      metadata: {
        fromStatus: input.fromStatus,
        toStatus: input.toStatus,
      },
    });
  });
}

async function runRestaurantFlow(orderId: string) {
  const fixtures = await requireFixtures();

  await transitionRestaurantOrder({
    actorUserId: fixtures.restaurantStaff.id,
    orderId,
    fromStatus: "pending_confirmation",
    toStatus: "accepted",
    comment: "Smoke restaurant accepted order.",
  });
  await transitionRestaurantOrder({
    actorUserId: fixtures.restaurantStaff.id,
    orderId,
    fromStatus: "accepted",
    toStatus: "preparing",
    comment: "Smoke restaurant started preparing order.",
  });
  await transitionRestaurantOrder({
    actorUserId: fixtures.restaurantStaff.id,
    orderId,
    fromStatus: "preparing",
    toStatus: "ready_for_pickup",
    comment: "Smoke restaurant marked order ready for pickup.",
  });
}

async function verifyOperatorActiveOrderVisibility(order: SmokeOrder) {
  const operatorOrders = await getOperatorOrders();
  const operatorOrder = operatorOrders.find(
    (candidate) => candidate.number === order.publicNumber,
  );

  assert(
    operatorOrder,
    `Operator dashboard does not show active smoke order ${order.publicNumber}.`,
  );
  assert(
    operatorOrder.deliveryId === order.deliveryId,
    "Operator dashboard smoke order has an unexpected delivery id.",
  );
  assert(
    operatorOrder.latestOffer?.status === "pending",
    "Operator dashboard does not show the pending courier offer.",
  );
}

async function verifyOperatorPilotJournal(order: SmokeOrder) {
  const pilotJournal = await getOperatorPilotJournal();
  const pilotOrder = pilotJournal.orders.find(
    (candidate) => candidate.number === order.publicNumber,
  );

  assert(
    pilotOrder,
    `Operator pilot journal does not show smoke order ${order.publicNumber}.`,
  );
  assert(
    pilotOrder.status === "delivered",
    `Operator pilot journal expected delivered, got ${pilotOrder.status}.`,
  );
  assert(
    pilotOrder.deliveryStatus === "delivered",
    "Operator pilot journal does not show delivered delivery status.",
  );
}

async function runCourierFlow(order: SmokeOrder) {
  const fixtures = await requireFixtures();
  const dispatchResult = await dispatchNextCourierOffer(order.deliveryId);

  assert(
    dispatchResult.status === "offer_created" ||
      dispatchResult.status === "active_offer_exists",
    `Dispatch failed with status ${dispatchResult.status}.`,
  );

  const prisma = getPrisma();
  const offer = await prisma.courierOffer.findFirst({
    where: {
      deliveryId: order.deliveryId,
      courierId: fixtures.courier.id,
      status: "pending",
    },
    orderBy: { createdAt: "desc" },
  });
  assert(offer, "Courier offer was not created for the smoke courier.");

  await verifyOperatorActiveOrderVisibility(order);

  const accepted = await acceptCourierOfferForUser({
    offerId: offer.id,
    userId: fixtures.courierUser.id,
  });
  assert(accepted.status === "accepted", `Courier accept failed: ${accepted.status}.`);

  const pickedUp = await transitionCourierDeliveryForUser({
    deliveryId: order.deliveryId,
    userId: fixtures.courierUser.id,
    deliveryFromStatus: "assigned",
    orderFromStatus: "ready_for_pickup",
    deliveryToStatus: "picked_up",
    orderToStatus: "picked_up",
    pickedUpAt: new Date(),
    comment: "Smoke courier picked up order.",
  });
  assert(pickedUp.status === "updated", `Pickup failed: ${pickedUp.status}.`);

  const delivering = await transitionCourierDeliveryForUser({
    deliveryId: order.deliveryId,
    userId: fixtures.courierUser.id,
    deliveryFromStatus: "picked_up",
    orderFromStatus: "picked_up",
    deliveryToStatus: "delivering",
    orderToStatus: "delivering",
    comment: "Smoke courier started delivery.",
  });
  assert(delivering.status === "updated", `Start delivery failed: ${delivering.status}.`);

  const delivered = await transitionCourierDeliveryForUser({
    deliveryId: order.deliveryId,
    userId: fixtures.courierUser.id,
    deliveryFromStatus: "delivering",
    orderFromStatus: "delivering",
    deliveryToStatus: "delivered",
    orderToStatus: "delivered",
    deliveredAt: new Date(),
    releaseCourier: true,
    settleFinances: true,
    cashCollectedConfirmed: true,
    comment: "Smoke courier completed delivery.",
  });
  assert(delivered.status === "updated", `Complete delivery failed: ${delivered.status}.`);
}

async function verifySmokeOrder(order: SmokeOrder) {
  const prisma = getPrisma();
  const stored = await prisma.order.findUnique({
    where: { id: order.id },
    include: {
      courierLedgerEntries: true,
      delivery: {
        include: {
          offers: true,
        },
      },
      deliveryAddress: true,
      deliveryFeeCalculation: true,
      financials: true,
      items: true,
      payments: {
        include: {
          transactions: true,
        },
      },
      restaurantLedgerEntries: true,
      statusHistory: true,
    },
  });

  assert(stored, "Smoke order disappeared.");
  assert(stored.status === "delivered", `Expected delivered, got ${stored.status}.`);
  assert(stored.paymentStatus === "paid", `Expected paid, got ${stored.paymentStatus}.`);
  assert(stored.delivery?.status === "delivered", "Delivery is not delivered.");
  assert(stored.delivery.courierId, "Delivery has no courier.");
  assert(stored.items.length > 0, "Order items were not created.");
  assert(stored.deliveryAddress, "Order delivery address was not created.");
  assert(stored.deliveryFeeCalculation, "Delivery fee calculation was not created.");
  assert(stored.financials, "Order financials were not created.");
  assert(stored.payments.length === 1, "Expected one payment record.");
  assert(stored.payments[0].status === "paid", "Payment was not marked paid.");
  assert(
    stored.payments[0].transactions.some(
      (transaction) =>
        transaction.type === "payment" && transaction.status === "paid",
    ),
    "Paid payment transaction is missing.",
  );
  assert(stored.statusHistory.length >= 7, "Order status history is incomplete.");
  assert(stored.courierLedgerEntries.length >= 2, "Courier ledger entries are missing.");
  assert(
    stored.restaurantLedgerEntries.length >= 2,
    "Restaurant ledger entries are missing.",
  );

  return {
    courierLedgerEntries: stored.courierLedgerEntries.length,
    deliveryStatus: stored.delivery.status,
    orderStatus: stored.status,
    paymentStatus: stored.paymentStatus,
    publicNumber: stored.publicNumber,
    restaurantLedgerEntries: stored.restaurantLedgerEntries.length,
    statusHistoryEntries: stored.statusHistory.length,
    total: stored.financials.customerTotal,
  };
}

export async function runSmokeCashOrder() {
  assertSmokeWritesAllowed();
  await prepareSmokeFixturesForRerun();

  const order = await createSmokeOrder();

  await runRestaurantFlow(order.id);
  await runCourierFlow(order);

  const summary = await verifySmokeOrder(order);
  await verifyOperatorPilotJournal(order);

  return {
    ok: true,
    summary,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runSmokeCashOrder()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await getPrisma().$disconnect();
    });
}
