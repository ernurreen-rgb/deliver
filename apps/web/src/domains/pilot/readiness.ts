import { formatKzt } from "@/lib/money/format";
import { getPrisma } from "@/lib/db/prisma";
import { isDevOtpEnabled } from "@/domains/auth/constants";
import { validateReleaseEnv } from "@/lib/release-env";

const PILOT_OPERATOR_PHONE = "+77000000001";
const PILOT_CUSTOMER_PHONE = "+77000000002";
const PILOT_COURIER_PHONE = "+77000000003";
const PILOT_RESTAURANT_SLUG = "tengri-kitchen";

type PilotReadinessStatus = "ready" | "warning" | "blocked";

type PilotReadinessCheck = {
  key: string;
  label: string;
  detail: string;
  status: PilotReadinessStatus;
};

function hasCoordinates(input: {
  latitude?: unknown | null;
  longitude?: unknown | null;
}) {
  return Boolean(input.latitude && input.longitude);
}

function checkStatus(condition: boolean, blocked = true): PilotReadinessStatus {
  if (condition) {
    return "ready";
  }

  return blocked ? "blocked" : "warning";
}

export async function getPilotReadiness() {
  const prisma = getPrisma();

  const [
    operator,
    customer,
    courierUser,
    restaurant,
    pricingRule,
    serviceRule,
    latestCashOrder,
  ] = await Promise.all([
      prisma.user.findUnique({
        where: { phone: PILOT_OPERATOR_PHONE },
        include: {
          roles: true,
          restaurantStaff: true,
        },
      }),
      prisma.user.findUnique({
        where: { phone: PILOT_CUSTOMER_PHONE },
        include: {
          addresses: {
            orderBy: { createdAt: "asc" },
          },
        },
      }),
      prisma.user.findUnique({
        where: { phone: PILOT_COURIER_PHONE },
        include: {
          courier: {
            include: {
              availability: true,
              deliveries: {
                where: {
                  status: {
                    in: ["assigned", "picked_up", "delivering"],
                  },
                },
                include: {
                  order: {
                    select: {
                      publicNumber: true,
                    },
                  },
                },
              },
              profile: true,
            },
          },
        },
      }),
      prisma.restaurant.findUnique({
        where: { slug: PILOT_RESTAURANT_SLUG },
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
          },
          staff: true,
          translations: true,
        },
      }),
      prisma.deliveryPricingRule.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.serviceFeeRule.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.order.findFirst({
        where: {
          customer: { phone: PILOT_CUSTOMER_PHONE },
          paymentMethod: "cash_to_courier",
          restaurant: { slug: PILOT_RESTAURANT_SLUG },
        },
        orderBy: { createdAt: "desc" },
        select: {
          createdAt: true,
          delivery: {
            select: {
              status: true,
            },
          },
          financials: {
            select: {
              customerTotal: true,
            },
          },
          paymentStatus: true,
          publicNumber: true,
          status: true,
        },
      }),
    ]);

  const customerAddress = customer?.addresses.find(hasCoordinates) ?? null;
  const courier = courierUser?.courier ?? null;
  const courierHasLocation = hasCoordinates({
    latitude: courier?.availability?.latitude,
    longitude: courier?.availability?.longitude,
  });
  const availableMenuItems =
    restaurant?.menuItems.filter(
      (item) => item.price >= (restaurant?.minimumOrderAmount ?? 0),
    ) ?? [];
  const restaurantRu = restaurant?.translations.find(
    (translation) => translation.language === "ru",
  );
  const courierActiveDeliveries = courier?.deliveries ?? [];
  const operatorRoles = new Set(operator?.roles.map((role) => role.role) ?? []);
  const operatorHasBackOfficeRole =
    operatorRoles.has("admin") || operatorRoles.has("operator");
  const operatorHasRestaurantScope = Boolean(
    restaurant &&
      operator?.restaurantStaff.some(
        (staff) => staff.restaurantId === restaurant.id,
      ),
  );
  const operatorHasAccess =
    operatorHasBackOfficeRole && operatorHasRestaurantScope;
  const envValidation = validateReleaseEnv(process.env);
  const devOtpReady = isDevOtpEnabled();
  const failedEnvChecks = envValidation.checks
    .filter((check) => !check.ok)
    .map((check) => check.name);

  const checks: PilotReadinessCheck[] = [
    {
      key: "operator",
      label: "Оператор / ресторан",
      status: checkStatus(Boolean(operator && operatorHasAccess)),
      detail: operator
        ? `${PILOT_OPERATOR_PHONE}: ${
            operatorHasAccess
              ? "есть доступ к оператору и staff-scope ресторана"
              : "не хватает back-office роли или staff-scope для пилота"
          }`
        : `${PILOT_OPERATOR_PHONE}: пользователь не найден`,
    },
    {
      key: "customer",
      label: "Клиент и адрес",
      status: checkStatus(Boolean(customer && customerAddress)),
      detail: customer
        ? customerAddress
          ? `${PILOT_CUSTOMER_PHONE}: адрес с координатами готов`
          : `${PILOT_CUSTOMER_PHONE}: нет адреса с координатами`
        : `${PILOT_CUSTOMER_PHONE}: пользователь не найден`,
    },
    {
      key: "restaurant",
      label: "Ресторан",
      status: checkStatus(
        Boolean(
          restaurant &&
            restaurant.status === "active" &&
            hasCoordinates(restaurant) &&
            restaurant.staff.length > 0,
        ),
      ),
      detail: restaurant
        ? `${restaurantRu?.name ?? restaurant.slug}: ${restaurant.status}, ${
            hasCoordinates(restaurant) ? "координаты есть" : "нет координат"
          }`
        : `${PILOT_RESTAURANT_SLUG}: ресторан не найден`,
    },
    {
      key: "menu",
      label: "Меню",
      status: checkStatus(availableMenuItems.length > 0),
      detail:
        availableMenuItems.length > 0
          ? `${availableMenuItems.length} доступн. позиций выше минимума`
          : "нет доступных блюд выше минимальной суммы заказа",
    },
    {
      key: "courier",
      label: "Курьер",
      status: checkStatus(
        Boolean(
          courier &&
            courier.status === "available" &&
            courier.availability?.status === "available" &&
            courierHasLocation,
        ),
      ),
      detail: courier
        ? `${courier.profile?.fullName ?? PILOT_COURIER_PHONE}: ${
            courier.status
          }, ${
            courierHasLocation ? "геопозиция есть" : "нет геопозиции"
          }`
        : `${PILOT_COURIER_PHONE}: профиль курьера не найден`,
    },
    {
      key: "courier-active-delivery",
      label: "Свободный курьер",
      status: checkStatus(courierActiveDeliveries.length === 0),
      detail:
        courierActiveDeliveries.length === 0
          ? "у smoke-курьера нет активной доставки"
          : `активные доставки: ${courierActiveDeliveries
              .map((delivery) => delivery.order.publicNumber)
              .join(", ")}`,
    },
    {
      key: "pricing",
      label: "Тарифы",
      status: checkStatus(Boolean(pricingRule && serviceRule)),
      detail:
        pricingRule && serviceRule
          ? `доставка от ${formatKzt(pricingRule.baseFee)}, сервисный сбор настроен`
          : "нет активного правила доставки или сервисного сбора",
    },
    {
      key: "environment",
      label: "Окружение",
      status: checkStatus(envValidation.ok && devOtpReady),
      detail:
        envValidation.ok && devOtpReady
          ? "dev OTP, cron, database и geo provider готовы"
          : [
              devOtpReady
                ? null
                : "dev OTP недоступен для текущего NODE_ENV/OTP_PROVIDER/closed-pilot allowlist",
              failedEnvChecks.length > 0
                ? `env не готов: ${failedEnvChecks.join(", ")}`
                : null,
            ]
              .filter(Boolean)
              .join("; "),
    },
  ];

  const blockedCount = checks.filter((check) => check.status === "blocked").length;
  const warningCount = checks.filter((check) => check.status === "warning").length;
  const readyCount = checks.filter((check) => check.status === "ready").length;

  return {
    blockedCount,
    checks,
    isReady: blockedCount === 0,
    latestCashOrder: latestCashOrder
      ? {
          createdAt: latestCashOrder.createdAt,
          deliveryStatus: latestCashOrder.delivery?.status ?? "pending_assignment",
          number: latestCashOrder.publicNumber,
          paymentStatus: latestCashOrder.paymentStatus,
          status: latestCashOrder.status,
          total: latestCashOrder.financials
            ? formatKzt(latestCashOrder.financials.customerTotal)
            : "-",
        }
      : null,
    readyCount,
    totalCount: checks.length,
    updatedAt: new Date(),
    warningCount,
  };
}
