import { Prisma } from "@/generated/prisma/client";
import type { DeliveryStatus, OrderStatus } from "@/generated/prisma/enums";
import {
  FinancialSettlementError,
  type FinancialSettlementErrorStatus,
  settleDeliveredCashOrder,
} from "@/domains/finance/order-settlement";
import { getPrisma } from "@/lib/db/prisma";

type CourierDeliveryTransitionInput = {
  deliveryId: string;
  userId: string;
  deliveryFromStatus: DeliveryStatus;
  orderFromStatus: OrderStatus;
  deliveryToStatus: DeliveryStatus;
  orderToStatus: OrderStatus;
  comment: string;
  pickedUpAt?: Date;
  deliveredAt?: Date;
  releaseCourier?: boolean;
  settleFinances?: boolean;
};

export type CourierDeliveryTransitionResult =
  | { status: "updated"; publicNumber: string }
  | { status: "courier_not_found" }
  | { status: "delivery_not_found" }
  | { status: "invalid_delivery_status"; publicNumber?: string }
  | { status: FinancialSettlementErrorStatus; publicNumber?: string };

class InvalidDeliveryStatusError extends Error {
  constructor(readonly publicNumber: string) {
    super("Invalid delivery status.");
  }
}

export async function transitionCourierDeliveryForUser(
  input: CourierDeliveryTransitionInput,
): Promise<CourierDeliveryTransitionResult> {
  const prisma = getPrisma();

  const courier = await prisma.courier.findUnique({
    where: { userId: input.userId },
    select: { id: true },
  });

  if (!courier) {
    return { status: "courier_not_found" };
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const delivery = await tx.delivery.findFirst({
        where: {
          id: input.deliveryId,
          courierId: courier.id,
        },
        include: {
          order: {
            include: {
              financials: true,
              payments: true,
            },
          },
        },
      });

      if (!delivery) {
        return { status: "delivery_not_found" };
      }

      if (
        delivery.status !== input.deliveryFromStatus ||
        delivery.order.status !== input.orderFromStatus
      ) {
        return {
          status: "invalid_delivery_status",
          publicNumber: delivery.order.publicNumber,
        };
      }

      const deliveryUpdate = await tx.delivery.updateMany({
        where: {
          id: delivery.id,
          courierId: courier.id,
          status: input.deliveryFromStatus,
        },
        data: {
          status: input.deliveryToStatus,
          pickedUpAt: input.pickedUpAt,
          deliveredAt: input.deliveredAt,
        },
      });

      if (deliveryUpdate.count !== 1) {
        throw new InvalidDeliveryStatusError(delivery.order.publicNumber);
      }

      const orderUpdate = await tx.order.updateMany({
        where: {
          id: delivery.orderId,
          status: input.orderFromStatus,
        },
        data: {
          status: input.orderToStatus,
          deliveredAt: input.deliveredAt,
          paymentStatus: input.settleFinances ? "paid" : undefined,
        },
      });

      if (orderUpdate.count !== 1) {
        throw new InvalidDeliveryStatusError(delivery.order.publicNumber);
      }

      await tx.orderStatusHistory.create({
        data: {
          orderId: delivery.orderId,
          fromStatus: input.orderFromStatus,
          toStatus: input.orderToStatus,
          changedByUserId: input.userId,
          comment: input.comment,
        },
      });

      if (input.settleFinances) {
        await settleDeliveredCashOrder({
          tx,
          order: delivery.order,
          courierId: courier.id,
          actorUserId: input.userId,
          paidAt: input.deliveredAt ?? new Date(),
        });
      }

      if (input.releaseCourier) {
        await tx.courier.update({
          where: { id: courier.id },
          data: { status: "available" },
        });

        await tx.courierAvailability.updateMany({
          where: { courierId: courier.id },
          data: { status: "available" },
        });
      }

      return {
        status: "updated",
        publicNumber: delivery.order.publicNumber,
      };
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  } catch (error) {
    if (error instanceof InvalidDeliveryStatusError) {
      return {
        status: "invalid_delivery_status",
        publicNumber: error.publicNumber,
      };
    }

    if (error instanceof FinancialSettlementError) {
      return {
        status: error.status,
        publicNumber: error.publicNumber,
      };
    }

    throw error;
  }
}
