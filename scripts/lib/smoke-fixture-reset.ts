import { Prisma } from "../../src/generated/prisma/client";
import { writeAuditLog } from "../../src/domains/audit/log";
import { getPrisma } from "../../src/lib/db/prisma";
import { getReleaseTarget } from "../../src/lib/release-env";

export const SMOKE_CUSTOMER_PHONE = "+77000000002";
export const SMOKE_COURIER_PHONE = "+77000000003";
export const SMOKE_RESTAURANT_SLUG = "tengri-kitchen";
export const SMOKE_ORDER_COMMENT_PREFIX = "smoke:cash-order";

const SEED_SMOKE_ORDER_NUMBER = "A-1001";
const SMOKE_RESET_FIXTURES_ENV = "SMOKE_RESET_FIXTURES";
const SMOKE_ALLOW_STAGING_WRITE_ENV = "SMOKE_ALLOW_STAGING_WRITE";
const SMOKE_ALLOW_PRODUCTION_WRITE_ENV = "SMOKE_ALLOW_PRODUCTION_WRITE";
const LOCAL_DATABASE_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const POSTGRES_HOST_OVERRIDE_PARAMS = new Set(["host", "hostaddr"]);

export const ACTIVE_SMOKE_DELIVERY_STATUSES = [
  "assigned",
  "picked_up",
  "delivering",
] as const;

export const ACTIVE_SMOKE_ORDER_STATUSES = [
  "created",
  "pending_confirmation",
  "accepted",
  "preparing",
  "ready_for_pickup",
  "courier_assigned",
  "picked_up",
  "delivering",
] as const;

type SmokeFixtureScope = {
  customerId: string;
  courierId: string;
  restaurantId: string;
};

export type SmokeDeliveryScopeCandidate = {
  status: string;
  order: SmokeOrderScopeCandidate;
};

export type SmokeOrderScopeCandidate = {
  customerComment: string | null;
  customerId: string;
  paymentMethod: string;
  publicNumber: string;
  restaurantId: string;
  status: string;
};

export function isActiveSmokeFixtureOrder(
  order: SmokeOrderScopeCandidate,
  scope: Pick<SmokeFixtureScope, "customerId" | "restaurantId">,
) {
  return (
    ACTIVE_SMOKE_ORDER_STATUSES.some((status) => status === order.status) &&
    order.customerId === scope.customerId &&
    order.restaurantId === scope.restaurantId &&
    order.paymentMethod === "cash_to_courier" &&
    (order.customerComment?.startsWith(SMOKE_ORDER_COMMENT_PREFIX) === true ||
      order.publicNumber === SEED_SMOKE_ORDER_NUMBER)
  );
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

export function isActiveSmokeFixtureDelivery(
  delivery: SmokeDeliveryScopeCandidate,
  scope: Pick<SmokeFixtureScope, "customerId" | "restaurantId">,
) {
  return (
    ACTIVE_SMOKE_DELIVERY_STATUSES.some(
      (status) => status === delivery.status,
    ) &&
    isActiveSmokeFixtureOrder(delivery.order, scope)
  );
}

function requireLocalSmokeDatabase() {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  assert(databaseUrl, "DATABASE_URL is required before resetting smoke fixtures.");

  const url = new URL(databaseUrl);
  const isPostgres = url.protocol === "postgresql:" || url.protocol === "postgres:";
  const databaseName = url.pathname.replace(/^\//, "");
  const hostOverride = Array.from(url.searchParams.keys()).find((key) =>
    POSTGRES_HOST_OVERRIDE_PARAMS.has(key.toLowerCase()),
  );

  assert(isPostgres, "Smoke fixture reset requires a PostgreSQL DATABASE_URL.");
  assert(
    !hostOverride,
    `Smoke fixture reset refuses DATABASE_URL query parameter "${hostOverride}" because it can override the checked host or select a socket path.`,
  );
  assert(
    LOCAL_DATABASE_HOSTS.has(url.hostname),
    "Smoke fixture reset refuses to write unless DATABASE_URL uses localhost, 127.0.0.1 or ::1.",
  );
  assert(
    databaseName === "deliver",
    `Smoke fixture reset refuses to write to database "${databaseName}". Expected "deliver".`,
  );
}

function assertSmokeResetAllowed() {
  const releaseTarget = getReleaseTarget(process.env);

  assert(
    releaseTarget,
    "RELEASE_TARGET must be one of: local, staging, production before resetting smoke fixtures.",
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
      `${SMOKE_ALLOW_STAGING_WRITE_ENV}=1 is required before resetting smoke fixtures with RELEASE_TARGET=staging.`,
    );
  }

  if (
    releaseTarget === "production" &&
    process.env[SMOKE_ALLOW_PRODUCTION_WRITE_ENV] !== "1"
  ) {
    throw new Error(
      `${SMOKE_ALLOW_PRODUCTION_WRITE_ENV}=1 is required before resetting smoke fixtures with RELEASE_TARGET=production.`,
    );
  }
}

async function resetSmokeFixturesInTransaction() {
  const prisma = getPrisma();

  return prisma.$transaction(
    async (tx) => {
      const now = new Date();
      const customer = await tx.user.findUnique({
        where: { phone: SMOKE_CUSTOMER_PHONE },
        select: { id: true },
      });
      const courierUser = await tx.user.findUnique({
        where: { phone: SMOKE_COURIER_PHONE },
        include: { courier: true },
      });
      const restaurant = await tx.restaurant.findUnique({
        where: { slug: SMOKE_RESTAURANT_SLUG },
        select: { id: true },
      });

      assert(customer, "Smoke customer is missing.");
      assert(courierUser?.courier, "Smoke courier profile is missing.");
      assert(restaurant, "Smoke restaurant is missing.");

      const scope: SmokeFixtureScope = {
        customerId: customer.id,
        courierId: courierUser.courier.id,
        restaurantId: restaurant.id,
      };
      const activeDeliveries = await tx.delivery.findMany({
        where: {
          courierId: scope.courierId,
          status: { in: [...ACTIVE_SMOKE_DELIVERY_STATUSES] },
        },
        include: {
          order: {
            select: {
              customerComment: true,
              customerId: true,
              id: true,
              paymentMethod: true,
              publicNumber: true,
              restaurantId: true,
              status: true,
            },
          },
        },
      });
      const nonSmokeDeliveries = activeDeliveries.filter(
        (delivery) => !isActiveSmokeFixtureDelivery(delivery, scope),
      );

      assert(
        nonSmokeDeliveries.length === 0,
        `Smoke fixture reset refuses to touch non-smoke active deliveries: ${nonSmokeDeliveries
          .map((delivery) => `${delivery.order.publicNumber}:${delivery.status}`)
          .join(", ")}`,
      );

      // Re-read the complete active set before mutation. Serializable isolation
      // turns a concurrent conflicting assignment into a transaction failure.
      const recheckedDeliveries = await tx.delivery.findMany({
        where: {
          courierId: scope.courierId,
          status: { in: [...ACTIVE_SMOKE_DELIVERY_STATUSES] },
        },
        include: {
          order: {
            select: {
              customerComment: true,
              customerId: true,
              id: true,
              paymentMethod: true,
              publicNumber: true,
              restaurantId: true,
              status: true,
            },
          },
        },
      });

      assert(
        recheckedDeliveries.every((delivery) =>
          isActiveSmokeFixtureDelivery(delivery, scope),
        ),
        "Smoke fixture reset scope changed during the transaction.",
      );

      const activeSmokeOrders = await tx.order.findMany({
        where: {
          customerId: scope.customerId,
          restaurantId: scope.restaurantId,
          paymentMethod: "cash_to_courier",
          status: { in: [...ACTIVE_SMOKE_ORDER_STATUSES] },
          OR: [
            { customerComment: { startsWith: SMOKE_ORDER_COMMENT_PREFIX } },
            { publicNumber: SEED_SMOKE_ORDER_NUMBER },
          ],
        },
        include: { delivery: true },
      });

      assert(
        activeSmokeOrders.every((order) =>
          isActiveSmokeFixtureOrder(order, scope),
        ),
        "Smoke order reset scope changed during the transaction.",
      );

      let cancelledDeliveries = 0;

      for (const order of activeSmokeOrders) {
        if (order.delivery) {
          await tx.courierOffer.updateMany({
            where: {
              deliveryId: order.delivery.id,
              status: { in: ["pending", "accepted"] },
            },
            data: {
              status: "cancelled",
              respondedAt: now,
            },
          });

          const deliveryResult = await tx.delivery.updateMany({
            where: {
              id: order.delivery.id,
              status: { notIn: ["delivered", "cancelled"] },
            },
            data: { status: "cancelled" },
          });
          cancelledDeliveries += deliveryResult.count;
        }

        await tx.order.update({
          where: { id: order.id },
          data: {
            cancelledAt: now,
            status: "cancelled",
          },
        });

        await tx.orderStatusHistory.create({
          data: {
            orderId: order.id,
            fromStatus: order.status,
            toStatus: "cancelled",
            comment:
              "Smoke fixture reset cancelled stale smoke order before rerun.",
          },
        });

        await writeAuditLog({
          tx,
          entityType: "order",
          entityId: order.id,
          action: "smoke_fixture_reset_v1",
          metadata: {
            deliveryId: order.delivery?.id ?? null,
            fromDeliveryStatus: order.delivery?.status ?? null,
            fromOrderStatus: order.status,
            publicNumber: order.publicNumber,
          },
        });
      }

      await tx.courier.update({
        where: { id: scope.courierId },
        data: { status: "available" },
      });
      await tx.courierAvailability.upsert({
        where: { courierId: scope.courierId },
        update: { status: "available" },
        create: {
          courierId: scope.courierId,
          status: "available",
        },
      });

      return {
        cancelledDeliveries,
        cancelledOrders: activeSmokeOrders.length,
        resetCourier: true,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function prepareSmokeFixturesForRerun() {
  assertSmokeResetAllowed();

  if (process.env[SMOKE_RESET_FIXTURES_ENV] !== "1") {
    return {
      ok: true,
      resetEnabled: false,
      message: `${SMOKE_RESET_FIXTURES_ENV}=1 not set; smoke fixtures were not reset.`,
    };
  }

  const result = await resetSmokeFixturesInTransaction();

  return {
    ok: true,
    resetEnabled: true,
    ...result,
  };
}
