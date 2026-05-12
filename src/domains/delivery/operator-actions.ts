"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";
import type { OrderStatus } from "@/generated/prisma/enums";
import { requireAnyRole } from "@/domains/auth/authorization";
import { dispatchNextCourierOffer } from "@/domains/delivery/dispatch";
import { getPrisma } from "@/lib/db/prisma";

const activeDeliveryStatuses = ["assigned", "picked_up", "delivering"] as const;
const dispatchableOrderStatuses = [
  "accepted",
  "preparing",
  "ready_for_pickup",
] as const;
const deliveryRepairableOrderStatuses = [
  ...dispatchableOrderStatuses,
  "courier_assigned",
] as const satisfies readonly OrderStatus[];
const cancellableOrderStatuses = [
  "pending_confirmation",
  "accepted",
  "preparing",
  "ready_for_pickup",
  "courier_assigned",
  "picked_up",
  "delivering",
] as const satisfies readonly OrderStatus[];

type CancellableOrderStatus = (typeof cancellableOrderStatuses)[number];

type ManualOperatorResult =
  | { status: "updated"; publicNumber: string; deliveryId?: string }
  | { status: "delivery_already_exists"; publicNumber?: string }
  | { status: "delivery_not_found" }
  | { status: "order_not_found" }
  | { status: "courier_not_found" }
  | { status: "courier_unavailable" }
  | { status: "invalid_delivery_status"; publicNumber?: string }
  | { status: "invalid_order_status"; publicNumber?: string }
  | { status: "order_not_dispatchable"; publicNumber?: string };

class OperatorActionConflictError extends Error {
  constructor(
    readonly status: Exclude<ManualOperatorResult["status"], "updated">,
    readonly publicNumber?: string,
  ) {
    super(status);
  }
}

function readString(formData: FormData, key: string, maxLength = 120) {
  const value = formData.get(key);
  const text = typeof value === "string" ? value.trim() : "";

  if (text.length > maxLength) {
    redirect("/operator?error=input_too_long");
  }

  return text;
}

function isDispatchableOrderStatus(status: string) {
  return dispatchableOrderStatuses.includes(
    status as (typeof dispatchableOrderStatuses)[number],
  );
}

function isCancellableOrderStatus(
  status: OrderStatus,
): status is CancellableOrderStatus {
  return cancellableOrderStatuses.includes(status as CancellableOrderStatus);
}

function isDeliveryRepairableOrderStatus(status: OrderStatus) {
  return deliveryRepairableOrderStatuses.includes(
    status as (typeof deliveryRepairableOrderStatuses)[number],
  );
}

function getOrderStatusAfterAssignment(status: OrderStatus) {
  return status === "ready_for_pickup" ? status : "courier_assigned";
}

function getOrderStatusAfterUnassignment(status: OrderStatus) {
  return status === "courier_assigned" ? "accepted" : status;
}

function getOrderStatusAfterDeliveryRepair(status: OrderStatus) {
  return status === "courier_assigned" ? "accepted" : status;
}

function revalidateOperatorFlows(publicNumber?: string) {
  revalidatePath("/operator");
  revalidatePath("/courier");
  revalidatePath("/restaurant");
  revalidatePath("/orders");

  if (publicNumber) {
    revalidatePath(`/orders/${publicNumber}`);
  }
}

async function releaseCourierIfIdle(input: {
  tx: Prisma.TransactionClient;
  courierId: string;
  excludeDeliveryId: string;
}) {
  const activeDeliveryCount = await input.tx.delivery.count({
    where: {
      id: { not: input.excludeDeliveryId },
      courierId: input.courierId,
      status: { in: [...activeDeliveryStatuses] },
    },
  });

  if (activeDeliveryCount > 0) {
    return;
  }

  await input.tx.courier.updateMany({
    where: { id: input.courierId },
    data: { status: "available" },
  });

  await input.tx.courierAvailability.updateMany({
    where: { courierId: input.courierId },
    data: { status: "available" },
  });
}

async function createDeliveryForOrder(input: {
  orderId: string;
  operatorUserId: string;
}): Promise<ManualOperatorResult> {
  const prisma = getPrisma();
  const now = new Date();

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const order = await tx.order.findUnique({
          where: { id: input.orderId },
          include: {
            delivery: {
              select: { id: true },
            },
          },
        });

        if (!order) {
          return { status: "order_not_found" as const };
        }

        if (order.delivery) {
          return {
            status: "delivery_already_exists" as const,
            publicNumber: order.publicNumber,
          };
        }

        if (!isDeliveryRepairableOrderStatus(order.status)) {
          return {
            status: "order_not_dispatchable" as const,
            publicNumber: order.publicNumber,
          };
        }

        const nextOrderStatus = getOrderStatusAfterDeliveryRepair(order.status);
        const delivery = await tx.delivery.create({
          data: {
            orderId: order.id,
            status: "pending_assignment",
          },
          select: { id: true },
        });

        const orderUpdate = await tx.order.updateMany({
          where: {
            id: order.id,
            status: order.status,
          },
          data: {
            status: nextOrderStatus,
          },
        });

        if (orderUpdate.count !== 1) {
          throw new OperatorActionConflictError(
            "invalid_order_status",
            order.publicNumber,
          );
        }

        await tx.orderStatusHistory.create({
          data: {
            orderId: order.id,
            fromStatus: order.status,
            toStatus: nextOrderStatus,
            changedByUserId: input.operatorUserId,
            comment:
              order.status === nextOrderStatus
                ? "Operator created missing delivery."
                : "Operator recreated missing delivery and returned order to dispatch.",
          },
        });

        return {
          status: "updated" as const,
          publicNumber: order.publicNumber,
          deliveryId: delivery.id,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    if (result.status === "updated" && result.deliveryId) {
      await dispatchNextCourierOffer(result.deliveryId, now);
    }

    return result;
  } catch (error) {
    if (error instanceof OperatorActionConflictError) {
      return { status: error.status, publicNumber: error.publicNumber };
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { status: "delivery_already_exists" };
    }

    throw error;
  }
}

async function assignCourierManually(input: {
  deliveryId: string;
  courierId: string;
  operatorUserId: string;
}): Promise<ManualOperatorResult> {
  const prisma = getPrisma();
  const now = new Date();

  try {
    const result = await prisma.$transaction(async (tx) => {
      const delivery = await tx.delivery.findUnique({
        where: { id: input.deliveryId },
        include: {
          order: {
            select: {
              id: true,
              publicNumber: true,
              status: true,
            },
          },
        },
      });

      if (!delivery) {
        return { status: "delivery_not_found" as const };
      }

      if (delivery.courierId || delivery.status !== "pending_assignment") {
        return {
          status: "invalid_delivery_status" as const,
          publicNumber: delivery.order.publicNumber,
        };
      }

      if (!isDispatchableOrderStatus(delivery.order.status)) {
        return {
          status: "order_not_dispatchable" as const,
          publicNumber: delivery.order.publicNumber,
        };
      }

      const courier = await tx.courier.findUnique({
        where: { id: input.courierId },
        include: {
          availability: true,
          deliveries: {
            where: {
              status: { in: [...activeDeliveryStatuses] },
            },
            select: { id: true },
          },
        },
      });

      if (!courier) {
        return { status: "courier_not_found" as const };
      }

      if (
        courier.status !== "available" ||
        courier.availability?.status !== "available" ||
        !courier.availability.latitude ||
        !courier.availability.longitude ||
        courier.deliveries.length > 0
      ) {
        return {
          status: "courier_unavailable" as const,
          publicNumber: delivery.order.publicNumber,
        };
      }

      const courierUpdate = await tx.courier.updateMany({
        where: {
          id: courier.id,
          status: "available",
        },
        data: {
          status: "busy",
        },
      });

      if (courierUpdate.count !== 1) {
        throw new OperatorActionConflictError(
          "courier_unavailable",
          delivery.order.publicNumber,
        );
      }

      const availabilityUpdate = await tx.courierAvailability.updateMany({
        where: {
          courierId: courier.id,
          status: "available",
        },
        data: {
          status: "busy",
        },
      });

      if (availabilityUpdate.count !== 1) {
        throw new OperatorActionConflictError(
          "courier_unavailable",
          delivery.order.publicNumber,
        );
      }

      const deliveryUpdate = await tx.delivery.updateMany({
        where: {
          id: delivery.id,
          courierId: null,
          status: "pending_assignment",
        },
        data: {
          courierId: courier.id,
          status: "assigned",
          assignedByUserId: input.operatorUserId,
          assignedAt: now,
        },
      });

      if (deliveryUpdate.count !== 1) {
        throw new OperatorActionConflictError(
          "invalid_delivery_status",
          delivery.order.publicNumber,
        );
      }

      const nextOrderStatus = getOrderStatusAfterAssignment(delivery.order.status);
      const orderUpdate = await tx.order.updateMany({
        where: {
          id: delivery.orderId,
          status: delivery.order.status,
        },
        data: {
          status: nextOrderStatus,
        },
      });

      if (orderUpdate.count !== 1) {
        throw new OperatorActionConflictError(
          "invalid_order_status",
          delivery.order.publicNumber,
        );
      }

      await tx.courierOffer.updateMany({
        where: {
          deliveryId: delivery.id,
          status: "pending",
        },
        data: {
          status: "cancelled",
          respondedAt: now,
        },
      });

      const supersededOffers = await tx.courierOffer.findMany({
        where: {
          courierId: courier.id,
          deliveryId: { not: delivery.id },
          status: "pending",
        },
        select: { deliveryId: true },
      });

      await tx.courierOffer.updateMany({
        where: {
          courierId: courier.id,
          deliveryId: { not: delivery.id },
          status: "pending",
        },
        data: {
          status: "cancelled",
          respondedAt: now,
        },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId: delivery.orderId,
          fromStatus: delivery.order.status,
          toStatus: nextOrderStatus,
          changedByUserId: input.operatorUserId,
          comment: "Operator manually assigned courier.",
        },
      });

      return {
        status: "updated" as const,
        publicNumber: delivery.order.publicNumber,
        redispatchDeliveryIds: [
          ...new Set(supersededOffers.map((offer) => offer.deliveryId)),
        ],
      };
    });

    if (result.status === "updated") {
      for (const deliveryId of result.redispatchDeliveryIds) {
        await dispatchNextCourierOffer(deliveryId, now);
      }
    }

    return result.status === "updated"
      ? { status: "updated", publicNumber: result.publicNumber }
      : result;
  } catch (error) {
    if (error instanceof OperatorActionConflictError) {
      return { status: error.status, publicNumber: error.publicNumber };
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { status: "courier_unavailable" };
    }

    throw error;
  }
}

async function unassignCourier(input: {
  deliveryId: string;
  operatorUserId: string;
}): Promise<ManualOperatorResult> {
  const prisma = getPrisma();
  const now = new Date();

  try {
    return await prisma.$transaction(
      async (tx) => {
        const delivery = await tx.delivery.findUnique({
          where: { id: input.deliveryId },
          include: {
            order: {
              select: {
                id: true,
                publicNumber: true,
                status: true,
              },
            },
          },
        });

        if (!delivery) {
          return { status: "delivery_not_found" as const };
        }

        if (!delivery.courierId || delivery.status !== "assigned") {
          return {
            status: "invalid_delivery_status" as const,
            publicNumber: delivery.order.publicNumber,
          };
        }

        const nextOrderStatus = getOrderStatusAfterUnassignment(
          delivery.order.status,
        );
        const deliveryUpdate = await tx.delivery.updateMany({
          where: {
            id: delivery.id,
            courierId: delivery.courierId,
            status: "assigned",
          },
          data: {
            courierId: null,
            status: "pending_assignment",
            assignedByUserId: null,
            assignedAt: null,
          },
        });

        if (deliveryUpdate.count !== 1) {
          throw new OperatorActionConflictError(
            "invalid_delivery_status",
            delivery.order.publicNumber,
          );
        }

        const orderUpdate = await tx.order.updateMany({
          where: {
            id: delivery.orderId,
            status: delivery.order.status,
          },
          data: {
            status: nextOrderStatus,
          },
        });

        if (orderUpdate.count !== 1) {
          throw new OperatorActionConflictError(
            "invalid_order_status",
            delivery.order.publicNumber,
          );
        }

        await releaseCourierIfIdle({
          tx,
          courierId: delivery.courierId,
          excludeDeliveryId: delivery.id,
        });

        await tx.courierOffer.updateMany({
          where: {
            deliveryId: delivery.id,
            status: "pending",
          },
          data: {
            status: "cancelled",
            respondedAt: now,
          },
        });

        await tx.orderStatusHistory.create({
          data: {
            orderId: delivery.orderId,
            fromStatus: delivery.order.status,
            toStatus: nextOrderStatus,
            changedByUserId: input.operatorUserId,
            comment: "Operator removed assigned courier.",
          },
        });

        return {
          status: "updated" as const,
          publicNumber: delivery.order.publicNumber,
          deliveryId: delivery.id,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  } catch (error) {
    if (error instanceof OperatorActionConflictError) {
      return { status: error.status, publicNumber: error.publicNumber };
    }

    throw error;
  }
}

async function cancelOrderByOperator(input: {
  orderId: string;
  reason: string;
  operatorUserId: string;
}): Promise<ManualOperatorResult> {
  const prisma = getPrisma();
  const now = new Date();

  try {
    return await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: input.orderId },
        include: {
          delivery: true,
        },
      });

      if (!order) {
        return { status: "order_not_found" as const };
      }

      if (!isCancellableOrderStatus(order.status)) {
        return {
          status: "invalid_order_status" as const,
          publicNumber: order.publicNumber,
        };
      }

      const orderUpdate = await tx.order.updateMany({
        where: {
          id: order.id,
          status: { in: [...cancellableOrderStatuses] },
        },
        data: {
          status: "cancelled",
          cancelledAt: now,
          restaurantComment: input.reason,
        },
      });

      if (orderUpdate.count !== 1) {
        throw new OperatorActionConflictError(
          "invalid_order_status",
          order.publicNumber,
        );
      }

      if (order.delivery) {
        await tx.delivery.updateMany({
          where: {
            id: order.delivery.id,
            status: { notIn: ["delivered", "cancelled"] },
          },
          data: {
            status: "cancelled",
          },
        });

        await tx.courierOffer.updateMany({
          where: {
            deliveryId: order.delivery.id,
            status: "pending",
          },
          data: {
            status: "cancelled",
            respondedAt: now,
          },
        });

        if (
          order.delivery.courierId &&
          activeDeliveryStatuses.includes(
            order.delivery.status as (typeof activeDeliveryStatuses)[number],
          )
        ) {
          await releaseCourierIfIdle({
            tx,
            courierId: order.delivery.courierId,
            excludeDeliveryId: order.delivery.id,
          });
        }
      }

      await tx.payment.updateMany({
        where: {
          orderId: order.id,
          status: { in: ["pending", "authorized"] },
        },
        data: {
          status: "cancelled",
        },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          fromStatus: order.status,
          toStatus: "cancelled",
          changedByUserId: input.operatorUserId,
          comment: `Operator cancelled order: ${input.reason}`,
        },
      });

      return {
        status: "updated" as const,
        publicNumber: order.publicNumber,
      };
    });
  } catch (error) {
    if (error instanceof OperatorActionConflictError) {
      return { status: error.status, publicNumber: error.publicNumber };
    }

    throw error;
  }
}

export async function createDeliveryForOrderAction(formData: FormData) {
  const user = await requireAnyRole(["operator", "admin"]);
  const orderId = readString(formData, "orderId");

  if (!orderId) {
    redirect("/operator?error=order_required");
  }

  const result = await createDeliveryForOrder({
    orderId,
    operatorUserId: user.id,
  });

  revalidateOperatorFlows(
    "publicNumber" in result ? result.publicNumber : undefined,
  );

  if (result.status === "updated") {
    redirect(`/operator?updated=${result.publicNumber}`);
  }

  redirect(`/operator?error=${result.status}`);
}

export async function retryCourierDispatchAction(formData: FormData) {
  await requireAnyRole(["operator", "admin"]);

  const deliveryId = readString(formData, "deliveryId");

  if (!deliveryId) {
    redirect("/operator?error=delivery_required");
  }

  const result = await dispatchNextCourierOffer(deliveryId);
  revalidateOperatorFlows();

  if (result.status === "offer_created" || result.status === "active_offer_exists") {
    redirect("/operator?updated=dispatch_started");
  }

  redirect(`/operator?error=${result.status}`);
}

export async function assignCourierManuallyAction(formData: FormData) {
  const user = await requireAnyRole(["operator", "admin"]);
  const deliveryId = readString(formData, "deliveryId");
  const courierId = readString(formData, "courierId");

  if (!deliveryId) {
    redirect("/operator?error=delivery_required");
  }

  if (!courierId) {
    redirect("/operator?error=courier_required");
  }

  const result = await assignCourierManually({
    deliveryId,
    courierId,
    operatorUserId: user.id,
  });

  revalidateOperatorFlows(
    "publicNumber" in result ? result.publicNumber : undefined,
  );

  if (result.status === "updated") {
    redirect(`/operator?updated=${result.publicNumber}`);
  }

  redirect(`/operator?error=${result.status}`);
}

export async function unassignCourierAction(formData: FormData) {
  const user = await requireAnyRole(["operator", "admin"]);
  const deliveryId = readString(formData, "deliveryId");

  if (!deliveryId) {
    redirect("/operator?error=delivery_required");
  }

  const result = await unassignCourier({
    deliveryId,
    operatorUserId: user.id,
  });

  revalidateOperatorFlows(
    "publicNumber" in result ? result.publicNumber : undefined,
  );

  if (result.status === "updated") {
    if (result.deliveryId) {
      await dispatchNextCourierOffer(result.deliveryId);
      revalidateOperatorFlows(result.publicNumber);
    }

    redirect(`/operator?updated=${result.publicNumber}`);
  }

  redirect(`/operator?error=${result.status}`);
}

export async function cancelOrderByOperatorAction(formData: FormData) {
  const user = await requireAnyRole(["operator", "admin"]);
  const orderId = readString(formData, "orderId");
  const reason = readString(formData, "reason", 500);

  if (!orderId) {
    redirect("/operator?error=order_required");
  }

  if (!reason) {
    redirect("/operator?error=reason_required");
  }

  const result = await cancelOrderByOperator({
    orderId,
    reason,
    operatorUserId: user.id,
  });

  revalidateOperatorFlows(
    "publicNumber" in result ? result.publicNumber : undefined,
  );

  if (result.status === "updated") {
    redirect(`/operator?updated=${result.publicNumber}`);
  }

  redirect(`/operator?error=${result.status}`);
}
