"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/domains/auth/session";
import { dispatchNextCourierOffer } from "@/domains/delivery/dispatch";
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

async function requireRestaurantOrder(orderId: string) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (!orderId) {
    redirect("/restaurant?error=order_required");
  }

  const prisma = getPrisma();
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      publicNumber: true,
      restaurantId: true,
      status: true,
    },
  });

  if (!order) {
    redirect("/restaurant?error=order_not_found");
  }

  const staff = await prisma.restaurantStaff.findFirst({
    where: {
      restaurantId: order.restaurantId,
      userId: user.id,
    },
  });

  if (!staff) {
    redirect("/restaurant?error=forbidden");
  }

  return { order, user };
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
  const { order, user } = await requireRestaurantOrder(orderId);

  if (!input.allowedStatuses.includes(order.status)) {
    redirect("/restaurant?error=invalid_status");
  }

  const prisma = getPrisma();
  let deliveryIdForDispatch: string | null = null;

  await prisma.$transaction(async (tx) => {
    const updated = await tx.order.updateMany({
      where: {
        id: order.id,
        restaurantId: order.restaurantId,
        status: { in: input.allowedStatuses },
      },
      data: {
        status: input.nextStatus,
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
        where: { orderId: order.id },
        data: input.paymentData,
      });
    }

    await tx.orderStatusHistory.create({
      data: {
        orderId: order.id,
        fromStatus: order.status,
        toStatus: input.nextStatus,
        changedByUserId: user.id,
        comment: input.comment,
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
  const restaurantComment =
    readString(formData, "restaurantComment") || "Ресторан отклонил заказ.";

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
