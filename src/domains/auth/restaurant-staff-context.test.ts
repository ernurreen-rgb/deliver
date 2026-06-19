import { beforeEach, describe, expect, it, vi } from "vitest";
import { getRestaurantStaffContextForUser } from "@/domains/auth/restaurant-staff-context";

const prismaMocks = vi.hoisted(() => ({
  prisma: {
    restaurantStaff: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db/prisma", () => ({
  getPrisma: () => prismaMocks.prisma,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getRestaurantStaffContextForUser", () => {
  it("returns context for a restaurant staff user with a staff row", async () => {
    prismaMocks.prisma.restaurantStaff.findFirst.mockResolvedValue({
      restaurantId: "restaurant-1",
      role: "manager",
      restaurant: { slug: "tengri-kitchen" },
    });

    await expect(
      getRestaurantStaffContextForUser({
        id: "user-1",
        roles: [{ role: "restaurant_staff" }],
      }),
    ).resolves.toEqual({
      userId: "user-1",
      restaurantId: "restaurant-1",
      restaurantSlug: "tengri-kitchen",
      staffRole: "manager",
    });
    expect(prismaMocks.prisma.restaurantStaff.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1" },
        orderBy: { createdAt: "asc" },
      }),
    );
  });

  it("returns context for an admin only when the admin has a staff row", async () => {
    prismaMocks.prisma.restaurantStaff.findFirst.mockResolvedValue({
      restaurantId: "restaurant-1",
      role: "owner",
      restaurant: { slug: "tengri-kitchen" },
    });

    await expect(
      getRestaurantStaffContextForUser({
        id: "admin-1",
        roles: [{ role: "admin" }],
      }),
    ).resolves.toMatchObject({
      userId: "admin-1",
      restaurantId: "restaurant-1",
      staffRole: "owner",
    });
  });

  it("rejects an admin without a restaurant staff row", async () => {
    prismaMocks.prisma.restaurantStaff.findFirst.mockResolvedValue(null);

    await expect(
      getRestaurantStaffContextForUser({
        id: "admin-1",
        roles: [{ role: "admin" }],
      }),
    ).resolves.toBeNull();
  });

  it("rejects users without restaurant or admin roles without querying staff", async () => {
    await expect(
      getRestaurantStaffContextForUser({
        id: "customer-1",
        roles: [{ role: "customer" }],
      }),
    ).resolves.toBeNull();
    expect(prismaMocks.prisma.restaurantStaff.findFirst).not.toHaveBeenCalled();
  });

  it("uses the earliest staff row as the primary restaurant", async () => {
    prismaMocks.prisma.restaurantStaff.findFirst.mockResolvedValue({
      restaurantId: "first-restaurant",
      role: "staff",
      restaurant: { slug: "first" },
    });

    await getRestaurantStaffContextForUser({
      id: "multi-staff-1",
      roles: [{ role: "restaurant_staff" }],
    });

    expect(prismaMocks.prisma.restaurantStaff.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: "asc" },
      }),
    );
  });
});
