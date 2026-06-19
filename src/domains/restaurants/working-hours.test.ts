import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_RESTAURANT_CLOSES_AT,
  DEFAULT_RESTAURANT_OPENS_AT,
  getRestaurantWorkingHours,
  getWorkingHoursFieldName,
  normalizeRestaurantWorkingHours,
  parseRestaurantWorkingHours,
  RESTAURANT_WEEKDAYS,
  saveRestaurantWorkingHours,
} from "@/domains/restaurants/working-hours";

const prismaMocks = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn(),
    restaurant: {
      findFirst: vi.fn(),
    },
  },
  tx: {
    auditLog: {
      create: vi.fn(),
    },
    restaurantWorkingHour: {
      upsert: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db/prisma", () => ({
  getPrisma: () => prismaMocks.prisma,
}));

const context = {
  userId: "user-1",
  restaurantId: "restaurant-1",
  restaurantSlug: "tengri-kitchen",
  staffRole: "owner" as const,
};

function makeWorkingHoursForm() {
  const formData = new FormData();

  for (const weekday of RESTAURANT_WEEKDAYS) {
    formData.set(getWorkingHoursFieldName(weekday, "opensAt"), "09:00");
    formData.set(getWorkingHoursFieldName(weekday, "closesAt"), "22:00");
  }

  return formData;
}

beforeEach(() => {
  vi.resetAllMocks();
  prismaMocks.prisma.$transaction.mockImplementation(
    async (callback: (tx: typeof prismaMocks.tx) => Promise<unknown>) =>
      callback(prismaMocks.tx),
  );
});

describe("parseRestaurantWorkingHours", () => {
  it("parses seven working days", () => {
    const formData = makeWorkingHoursForm();

    const result = parseRestaurantWorkingHours(formData);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value).toHaveLength(7);
    expect(result.value[2]).toEqual({
      weekday: 3,
      opensAt: "09:00",
      closesAt: "22:00",
      isClosed: false,
    });
  });

  it("stores closed days without opening and closing times", () => {
    const formData = makeWorkingHoursForm();
    formData.set(getWorkingHoursFieldName(7, "isClosed"), "on");
    formData.delete(getWorkingHoursFieldName(7, "opensAt"));
    formData.delete(getWorkingHoursFieldName(7, "closesAt"));

    const result = parseRestaurantWorkingHours(formData);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value[6]).toEqual({
      weekday: 7,
      opensAt: null,
      closesAt: null,
      isClosed: true,
    });
  });

  it("rejects malformed, overnight, or zero-length working intervals", () => {
    const malformed = makeWorkingHoursForm();
    malformed.set(getWorkingHoursFieldName(2, "opensAt"), "25:00");

    expect(parseRestaurantWorkingHours(malformed)).toEqual({
      ok: false,
      error: "invalid_working_hours",
    });

    const zeroLength = makeWorkingHoursForm();
    zeroLength.set(getWorkingHoursFieldName(4, "opensAt"), "12:00");
    zeroLength.set(getWorkingHoursFieldName(4, "closesAt"), "12:00");

    expect(parseRestaurantWorkingHours(zeroLength)).toEqual({
      ok: false,
      error: "invalid_working_hours",
    });

    const overnight = makeWorkingHoursForm();
    overnight.set(getWorkingHoursFieldName(5, "opensAt"), "22:00");
    overnight.set(getWorkingHoursFieldName(5, "closesAt"), "02:00");

    expect(parseRestaurantWorkingHours(overnight)).toEqual({
      ok: false,
      error: "invalid_working_hours",
    });

    const invalidCheckbox = makeWorkingHoursForm();
    invalidCheckbox.set(getWorkingHoursFieldName(6, "isClosed"), "true");

    expect(parseRestaurantWorkingHours(invalidCheckbox)).toEqual({
      ok: false,
      error: "invalid_working_hours",
    });
  });
});

describe("normalizeRestaurantWorkingHours", () => {
  it("fills missing days with the pilot default schedule", () => {
    const hours = normalizeRestaurantWorkingHours([
      {
        weekday: 1,
        opensAt: "10:30",
        closesAt: "23:30",
        isClosed: false,
      },
      {
        weekday: 7,
        opensAt: null,
        closesAt: null,
        isClosed: true,
      },
    ]);

    expect(hours).toHaveLength(7);
    expect(hours[0]).toEqual({
      weekday: 1,
      opensAt: "10:30",
      closesAt: "23:30",
      isClosed: false,
      isConfigured: true,
    });
    expect(hours[1]).toEqual({
      weekday: 2,
      opensAt: DEFAULT_RESTAURANT_OPENS_AT,
      closesAt: DEFAULT_RESTAURANT_CLOSES_AT,
      isClosed: true,
      isConfigured: false,
    });
    expect(hours[6]).toMatchObject({
      weekday: 7,
      isClosed: true,
      isConfigured: true,
    });
  });

  it("rejects corrupted weekday values from storage", () => {
    expect(() =>
      normalizeRestaurantWorkingHours([
        {
          weekday: 8,
          opensAt: "09:00",
          closesAt: "22:00",
          isClosed: false,
        },
      ]),
    ).toThrow("invalid weekday");
  });
});

describe("restaurant working hours persistence", () => {
  it("loads settings only for the scoped restaurant", async () => {
    prismaMocks.prisma.restaurant.findFirst.mockResolvedValue({
      id: "restaurant-1",
      slug: "tengri-kitchen",
      translations: [{ language: "ru", name: "Tengri Kitchen" }],
      workingHours: [],
    });

    await expect(getRestaurantWorkingHours(context)).resolves.toMatchObject({
      restaurant: {
        id: "restaurant-1",
        name: "Tengri Kitchen",
      },
      hours: expect.any(Array),
    });
    expect(prismaMocks.prisma.restaurant.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "restaurant-1" },
      }),
    );
  });

  it("upserts all days in restaurant scope and writes an audit log", async () => {
    const hours = RESTAURANT_WEEKDAYS.map((weekday) => ({
      weekday,
      opensAt: "09:00",
      closesAt: "22:00",
      isClosed: false,
    }));

    await saveRestaurantWorkingHours({ context, hours });

    expect(prismaMocks.tx.restaurantWorkingHour.upsert).toHaveBeenCalledTimes(7);
    expect(prismaMocks.tx.restaurantWorkingHour.upsert).toHaveBeenNthCalledWith(
      1,
      {
        where: {
          restaurantId_weekday: {
            restaurantId: "restaurant-1",
            weekday: 1,
          },
        },
        update: {
          opensAt: "09:00",
          closesAt: "22:00",
          isClosed: false,
        },
        create: {
          restaurantId: "restaurant-1",
          weekday: 1,
          opensAt: "09:00",
          closesAt: "22:00",
          isClosed: false,
        },
      },
    );
    expect(prismaMocks.tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorUserId: "user-1",
          entityType: "restaurant",
          entityId: "restaurant-1",
          action: "restaurant_working_hours_updated_v1",
        }),
      }),
    );
  });

  it("rejects incomplete schedules before opening a transaction", async () => {
    await expect(
      saveRestaurantWorkingHours({
        context,
        hours: [
          {
            weekday: 1,
            opensAt: "09:00",
            closesAt: "22:00",
            isClosed: false,
          },
        ],
      }),
    ).rejects.toThrow("all seven weekdays");

    expect(prismaMocks.prisma.$transaction).not.toHaveBeenCalled();
  });
});
