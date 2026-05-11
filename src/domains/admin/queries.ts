import { getPrisma } from "@/lib/db/prisma";

export async function getAdminStats() {
  const prisma = getPrisma();

  const [restaurants, couriers, promocodes, orders] = await Promise.all([
    prisma.restaurant.count(),
    prisma.courier.count(),
    prisma.promocode.count(),
    prisma.order.count(),
  ]);

  return {
    restaurants,
    couriers,
    promocodes,
    orders,
  };
}
