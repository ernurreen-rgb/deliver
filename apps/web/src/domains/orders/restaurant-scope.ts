import type { OrderStatus, PaymentStatus } from "@/generated/prisma/enums";
import { getPrisma } from "@/lib/db/prisma";

export type RestaurantScopedOrder = {
  id: string;
  publicNumber: string;
  restaurantId: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
};

export async function getRestaurantOrderForStaffScope(input: {
  orderId: string;
  restaurantId: string;
}): Promise<RestaurantScopedOrder | null> {
  return getPrisma().order.findFirst({
    where: {
      id: input.orderId,
      restaurantId: input.restaurantId,
    },
    select: {
      id: true,
      publicNumber: true,
      restaurantId: true,
      status: true,
      paymentStatus: true,
    },
  });
}
