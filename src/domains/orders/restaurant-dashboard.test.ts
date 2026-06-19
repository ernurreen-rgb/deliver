import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getCourierDashboard,
  getOperatorOrders,
  getRestaurantDashboard,
} from "@/domains/orders/queries";

const dispatchMocks = vi.hoisted(() => ({
  expireCourierOffers: vi.fn(),
}));

const prismaMocks = vi.hoisted(() => ({
  prisma: {
    auditLog: {
      findMany: vi.fn(),
    },
    courier: {
      findUnique: vi.fn(),
    },
    menuItem: {
      count: vi.fn(),
    },
    order: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    restaurant: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/domains/delivery/dispatch", () => dispatchMocks);

vi.mock("@/lib/db/prisma", () => ({
  getPrisma: () => prismaMocks.prisma,
}));

beforeEach(() => {
  vi.resetAllMocks();
});

describe("getRestaurantDashboard", () => {
  it("does not expire courier offers while rendering the read-only restaurant dashboard", async () => {
    prismaMocks.prisma.restaurant.findUnique.mockResolvedValue({
      id: "restaurant-1",
      slug: "tengri-kitchen",
      addressLine: "Almaty",
      translations: [{ language: "ru", name: "Tengri Kitchen" }],
      balance: { balance: 0 },
    });
    prismaMocks.prisma.order.count.mockResolvedValue(0);
    prismaMocks.prisma.menuItem.count.mockResolvedValue(0);
    prismaMocks.prisma.order.findMany.mockResolvedValue([]);

    const dashboard = await getRestaurantDashboard({
      userId: "user-1",
      restaurantId: "restaurant-1",
      restaurantSlug: "tengri-kitchen",
      staffRole: "owner",
    });

    expect(dashboard).toMatchObject({
      restaurant: {
        id: "restaurant-1",
        name: "Tengri Kitchen",
      },
      orders: [],
    });
    expect(dispatchMocks.expireCourierOffers).not.toHaveBeenCalled();
  });
});

describe("read-only order dashboards", () => {
  it("does not expire courier offers while rendering the operator dashboard", async () => {
    prismaMocks.prisma.auditLog.findMany.mockResolvedValue([]);
    prismaMocks.prisma.order.findMany.mockResolvedValue([]);

    await expect(getOperatorOrders()).resolves.toEqual([]);

    expect(dispatchMocks.expireCourierOffers).not.toHaveBeenCalled();
  });

  it("treats expired pending courier offers as inactive for operator actions", async () => {
    const now = new Date("2026-06-07T10:00:00.000Z");
    const expiredAt = new Date("2026-06-07T09:59:00.000Z");

    prismaMocks.prisma.auditLog.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    prismaMocks.prisma.order.findMany.mockResolvedValueOnce([
      {
        id: "order-1",
        publicNumber: "D-1001",
        createdAt: now,
        updatedAt: now,
        status: "accepted",
        customer: {
          name: "Customer",
          phone: "+77000000002",
        },
        deliveryAddress: null,
        financials: {
          customerTotal: 420000,
        },
        statusHistory: [],
        restaurant: {
          slug: "tengri-kitchen",
          latitude: 43.2,
          longitude: 76.9,
          translations: [{ language: "ru", name: "Tengri Kitchen" }],
        },
        delivery: {
          id: "delivery-1",
          status: "pending_assignment",
          courierId: null,
          updatedAt: now,
          courier: null,
          offers: [
            {
              id: "offer-1",
              status: "pending",
              expiresAt: expiredAt,
              courier: {
                profile: {
                  fullName: "Courier",
                },
              },
            },
          ],
        },
      },
    ]);

    const orders = await getOperatorOrders();

    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({
      canAssignCourier: true,
      canRetryDispatch: true,
      latestOffer: {
        status: "pending",
        courier: "Courier",
        expiresAt: expiredAt,
      },
    });
    expect(orders[0]?.attention.isProblem).toBe(true);
    expect(dispatchMocks.expireCourierOffers).not.toHaveBeenCalled();
  });

  it("does not expire courier offers while rendering the courier dashboard", async () => {
    prismaMocks.prisma.courier.findUnique.mockResolvedValue(null);

    await expect(getCourierDashboard("user-1")).resolves.toBeNull();

    expect(dispatchMocks.expireCourierOffers).not.toHaveBeenCalled();
  });
});
