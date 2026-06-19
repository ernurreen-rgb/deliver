"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRestaurantStaffContext } from "@/domains/auth/restaurant-staff-context";
import { writeAuditLog } from "@/domains/audit/log";
import { dispatchNextCourierOffer } from "@/domains/delivery/dispatch";
import {
  cancellablePaymentStatuses,
  getOrderPaymentStatusAfterCancellation,
} from "@/domains/finance/payment-status";
import { getRestaurantOrderForStaffScope } from "@/domains/orders/restaurant-scope";
import type { OrderStatus } from "@/generated/prisma/enums";
import { getPrisma } from "@/lib/db/prisma";

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  const text = typeof value === "string" ? value.trim() : "";

  if (text.length > 500) {
    redirect("/restaurant?error=input_too_long");
  }

  return text;
}

function readPreparationMinutes(formData: FormData) {
  const rawValue = Number(readString(formData, "preparationMinutes"));

  if (!Number.isInteger(rawValue)) {
    return 30;
  }

  return Math.min(Math.max(rawValue, 5), 180);
}

function getRestaurantOrderAuditAction(status: OrderStatus) {
  const actions: Partial<Record<OrderStatus, string>> = {
    accepted: "restaurant_order_accepted_v1",
    cancelled: "restaurant_order_cancelled_v1",
    preparing: "restaurant_started_preparing_v1",
    ready_for_pickup: "restaurant_marked_ready_for_pickup_v1",
  };

  return actions[status] ?? "restaurant_order_status_changed_v1";
}

async function requireRestaurantOrder(orderId: string) {
  const staff = await requireRestaurantStaffContext({
    redirectPath: "/restaurant",
  });

  if (!orderId) {
    redirect("/restaurant?error=order_required");
  }

  const order = await getRestaurantOrderForStaffScope({
    orderId,
    restaurantId: staff.restaurantId,
  });

  if (!order) {
    redirect("/restaurant?error=forbidden");
  }

  return { order, staff };
}

async function transitionRestaurantOrder(input: {
  formData: FormData;
  nextStatus: OrderStatus;
  allowedStatuses: OrderStatus[];
  comment: string;
  orderData?: {
    acceptedAt?: Date;
    cancelledAt?: Date;
    restaurantComment?: string | null;
  };
  deliveryData?: {
    status: "cancelled";
  };
  paymentData?: {
    status: "cancelled";
  };
  dispatchCourier?: boolean;
}) {
  const orderId = readString(input.formData, "orderId");
  const { order, staff } = await requireRestaurantOrder(orderId);

  if (!input.allowedStatuses.includes(order.status)) {
    redirect("/restaurant?error=invalid_status");
  }

  const prisma = getPrisma();
  let deliveryIdForDispatch: string | null = null;

  await prisma.$transaction(async (tx) => {
    const nextOrderPaymentStatus = input.paymentData
      ? getOrderPaymentStatusAfterCancellation({
          currentStatus: order.paymentStatus,
        })
      : undefined;
    const updated = await tx.order.updateMany({
      where: {
        id: order.id,
        restaurantId: order.restaurantId,
        status: { in: input.allowedStatuses },
      },
      data: {
        status: input.nextStatus,
        paymentStatus: nextOrderPaymentStatus,
        ...input.orderData,
      },
    });

    if (updated.count !== 1) {
      throw new Error("Order status changed before restaurant action.");
    }

    if (input.deliveryData) {
      await tx.delivery.updateMany({
        where: { orderId: order.id },
        data: input.deliveryData,
      });

      if (input.deliveryData.status === "cancelled") {
        const delivery = await tx.delivery.findUnique({
          where: { orderId: order.id },
          select: { id: true },
        });

        if (delivery) {
          await tx.courierOffer.updateMany({
            where: {
              deliveryId: delivery.id,
              status: "pending",
            },
            data: {
              status: "cancelled",
              respondedAt: new Date(),
            },
          });
        }
      }
    }

    if (input.paymentData) {
      await tx.payment.updateMany({
        where: {
          orderId: order.id,
          status: { in: [...cancellablePaymentStatuses] },
        },
        data: input.paymentData,
      });
    }

    await tx.orderStatusHistory.create({
      data: {
        orderId: order.id,
        fromStatus: order.status,
        toStatus: input.nextStatus,
        changedByUserId: staff.userId,
        comment: input.comment,
      },
    });

    await writeAuditLog({
      tx,
      actorUserId: staff.userId,
      entityType: "order",
      entityId: order.id,
      action: getRestaurantOrderAuditAction(input.nextStatus),
      metadata: {
        publicNumber: order.publicNumber,
        restaurantId: order.restaurantId,
        fromStatus: order.status,
        toStatus: input.nextStatus,
        comment: input.comment,
        dispatchCourier: input.dispatchCourier ?? false,
      },
    });

    if (input.dispatchCourier) {
      const delivery = await tx.delivery.upsert({
        where: { orderId: order.id },
        update: {
          status: "pending_assignment",
          courierId: null,
          assignedByUserId: null,
          assignedAt: null,
        },
        create: {
          orderId: order.id,
          status: "pending_assignment",
        },
        select: {
          id: true,
        },
      });

      deliveryIdForDispatch = delivery.id;
    }
  });

  if (deliveryIdForDispatch) {
    await dispatchNextCourierOffer(deliveryIdForDispatch);
  }

  revalidatePath("/restaurant");
  revalidatePath("/courier");
  revalidatePath("/operator");
  redirect(`/restaurant?updated=${order.publicNumber}`);
}

export async function acceptRestaurantOrderAction(formData: FormData) {
  const preparationMinutes = readPreparationMinutes(formData);
  const restaurantComment = readString(formData, "restaurantComment");
  const comment = `Ресторан подтвердил заказ. Время приготовления: ${preparationMinutes} мин.`;

  await transitionRestaurantOrder({
    formData,
    nextStatus: "accepted",
    allowedStatuses: ["pending_confirmation"],
    comment,
    orderData: {
      acceptedAt: new Date(),
      restaurantComment: restaurantComment
        ? `${comment} ${restaurantComment}`
        : comment,
    },
    dispatchCourier: true,
  });
}

export async function rejectRestaurantOrderAction(formData: FormData) {
  const restaurantComment = readString(formData, "restaurantComment");

  if (!restaurantComment) {
    redirect("/restaurant?error=reason_required");
  }

  await transitionRestaurantOrder({
    formData,
    nextStatus: "cancelled",
    allowedStatuses: ["pending_confirmation", "accepted"],
    comment: restaurantComment,
    orderData: {
      cancelledAt: new Date(),
      restaurantComment,
    },
    deliveryData: {
      status: "cancelled",
    },
    paymentData: {
      status: "cancelled",
    },
  });
}

export async function startPreparingOrderAction(formData: FormData) {
  await transitionRestaurantOrder({
    formData,
    nextStatus: "preparing",
    allowedStatuses: ["accepted", "courier_assigned"],
    comment: "Ресторан начал готовить заказ.",
  });
}

export async function markOrderReadyForPickupAction(formData: FormData) {
  await transitionRestaurantOrder({
    formData,
    nextStatus: "ready_for_pickup",
    allowedStatuses: ["preparing"],
    comment: "Ресторан отметил заказ готовым к выдаче.",
  });
}
