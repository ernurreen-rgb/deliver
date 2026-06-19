import { writeAuditLog } from "@/domains/audit/log";
import type { RestaurantStaffContext } from "@/domains/auth/restaurant-staff-context";
import { getPrisma } from "@/lib/db/prisma";

export const RESTAURANT_WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
export const DEFAULT_RESTAURANT_OPENS_AT = "09:00";
export const DEFAULT_RESTAURANT_CLOSES_AT = "22:00";

export type RestaurantWeekday = (typeof RESTAURANT_WEEKDAYS)[number];

export type RestaurantWorkingHourInput = {
  weekday: RestaurantWeekday;
  opensAt: string | null;
  closesAt: string | null;
  isClosed: boolean;
};

type StoredRestaurantWorkingHour = {
  weekday: number;
  opensAt: string | null;
  closesAt: string | null;
  isClosed: boolean;
};

type WorkingHoursParseResult =
  | { ok: true; value: RestaurantWorkingHourInput[] }
  | { ok: false; error: "invalid_working_hours" };

const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function isRestaurantWeekday(value: number): value is RestaurantWeekday {
  return RESTAURANT_WEEKDAYS.some((weekday) => weekday === value);
}

function hasCompleteWeekdaySet(hours: readonly RestaurantWorkingHourInput[]) {
  return (
    hours.length === RESTAURANT_WEEKDAYS.length &&
    new Set(hours.map((hour) => hour.weekday)).size ===
      RESTAURANT_WEEKDAYS.length &&
    hours.every((hour) => isRestaurantWeekday(hour.weekday))
  );
}

export function getWorkingHoursFieldName(
  weekday: RestaurantWeekday,
  field: "opensAt" | "closesAt" | "isClosed",
) {
  return `weekday_${weekday}_${field}`;
}

function readFormString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export function parseRestaurantWorkingHours(
  formData: FormData,
): WorkingHoursParseResult {
  const hours: RestaurantWorkingHourInput[] = [];

  for (const weekday of RESTAURANT_WEEKDAYS) {
    const closedValue = formData.get(
      getWorkingHoursFieldName(weekday, "isClosed"),
    );

    if (closedValue !== null && closedValue !== "on") {
      return { ok: false, error: "invalid_working_hours" };
    }

    const isClosed = closedValue === "on";
    const opensAt = readFormString(
      formData,
      getWorkingHoursFieldName(weekday, "opensAt"),
    );
    const closesAt = readFormString(
      formData,
      getWorkingHoursFieldName(weekday, "closesAt"),
    );

    if (isClosed) {
      hours.push({ weekday, opensAt: null, closesAt: null, isClosed: true });
      continue;
    }

    if (
      !TIME_PATTERN.test(opensAt) ||
      !TIME_PATTERN.test(closesAt) ||
      opensAt >= closesAt
    ) {
      return { ok: false, error: "invalid_working_hours" };
    }

    hours.push({ weekday, opensAt, closesAt, isClosed: false });
  }

  return { ok: true, value: hours };
}

export function normalizeRestaurantWorkingHours(
  storedHours: readonly StoredRestaurantWorkingHour[],
) {
  if (storedHours.some((hour) => !isRestaurantWeekday(hour.weekday))) {
    throw new Error("Restaurant working hours contain an invalid weekday.");
  }

  const storedByWeekday = new Map(
    storedHours.map((hour) => [hour.weekday, hour]),
  );

  return RESTAURANT_WEEKDAYS.map((weekday) => {
    const stored = storedByWeekday.get(weekday);
    const storedOpensAt = stored?.opensAt ?? "";
    const storedClosesAt = stored?.closesAt ?? "";
    const hasValidTimes =
      TIME_PATTERN.test(storedOpensAt) &&
      TIME_PATTERN.test(storedClosesAt) &&
      storedOpensAt < storedClosesAt;

    return {
      weekday,
      opensAt: hasValidTimes
        ? storedOpensAt
        : DEFAULT_RESTAURANT_OPENS_AT,
      closesAt: hasValidTimes
        ? storedClosesAt
        : DEFAULT_RESTAURANT_CLOSES_AT,
      isClosed: stored ? stored.isClosed || !hasValidTimes : true,
      isConfigured: Boolean(stored),
    };
  });
}

export async function getRestaurantWorkingHours(
  context: RestaurantStaffContext,
) {
  const restaurant = await getPrisma().restaurant.findFirst({
    where: { id: context.restaurantId },
    select: {
      id: true,
      slug: true,
      translations: {
        select: {
          language: true,
          name: true,
        },
      },
      workingHours: {
        orderBy: { weekday: "asc" },
        select: {
          weekday: true,
          opensAt: true,
          closesAt: true,
          isClosed: true,
        },
      },
    },
  });

  if (!restaurant) {
    return null;
  }

  return {
    restaurant: {
      id: restaurant.id,
      slug: restaurant.slug,
      name:
        restaurant.translations.find(
          (translation) => translation.language === "ru",
        )?.name ?? restaurant.slug,
      role: context.staffRole,
    },
    hours: normalizeRestaurantWorkingHours(restaurant.workingHours),
  };
}

export async function saveRestaurantWorkingHours(input: {
  context: RestaurantStaffContext;
  hours: RestaurantWorkingHourInput[];
}) {
  if (!hasCompleteWeekdaySet(input.hours)) {
    throw new Error("Restaurant working hours must contain all seven weekdays.");
  }

  const prisma = getPrisma();

  await prisma.$transaction(async (tx) => {
    for (const hour of input.hours) {
      await tx.restaurantWorkingHour.upsert({
        where: {
          restaurantId_weekday: {
            restaurantId: input.context.restaurantId,
            weekday: hour.weekday,
          },
        },
        update: {
          opensAt: hour.opensAt,
          closesAt: hour.closesAt,
          isClosed: hour.isClosed,
        },
        create: {
          restaurantId: input.context.restaurantId,
          weekday: hour.weekday,
          opensAt: hour.opensAt,
          closesAt: hour.closesAt,
          isClosed: hour.isClosed,
        },
      });
    }

    await writeAuditLog({
      tx,
      actorUserId: input.context.userId,
      entityType: "restaurant",
      entityId: input.context.restaurantId,
      action: "restaurant_working_hours_updated_v1",
      metadata: {
        hours: input.hours.map((hour) => ({
          weekday: hour.weekday,
          opensAt: hour.opensAt,
          closesAt: hour.closesAt,
          isClosed: hour.isClosed,
        })),
      },
    });
  });
}
