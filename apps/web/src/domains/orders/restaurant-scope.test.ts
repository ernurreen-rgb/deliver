import { beforeEach, describe, expect, it, vi } from "vitest";
import { getRestaurantOrderForStaffScope } from "@/domains/orders/restaurant-scope";

const prismaMocks = vi.hoisted(() => ({
  prisma: {
    order: {
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

describe("getRestaurantOrderForStaffScope", () => {
  it("loads only orders that belong to the staff restaurant", async () => {
    prismaMocks.prisma.order.findFirst.mockResolvedValue({
      id: "order-1",
      publicNumber: "D-1001",
      restaurantId: "restaurant-1",
      status: "pending_confirmation",
      paymentStatus: "pending",
    });

    await expect(
      getRestaurantOrderForStaffScope({
        orderId: "order-1",
        restaurantId: "restaurant-1",
      }),
    ).resolves.toMatchObject({
      id: "order-1",
      restaurantId: "restaurant-1",
    });
    expect(prismaMocks.prisma.order.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "order-1",
          restaurantId: "restaurant-1",
        },
      }),
    );
  });

  it("returns null for orders outside the staff restaurant scope", async () => {
    prismaMocks.prisma.order.findFirst.mockResolvedValue(null);

    await expect(
      getRestaurantOrderForStaffScope({
        orderId: "order-2",
        restaurantId: "restaurant-1",
      }),
    ).resolves.toBeNull();
  });
});
