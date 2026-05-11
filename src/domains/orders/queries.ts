import { getPrisma } from "@/lib/db/prisma";
import { formatKzt } from "@/lib/money/format";
import { expireCourierOffers } from "@/domains/delivery/dispatch";
import type { OrderStatus } from "@/generated/prisma/enums";

export function getOrderStatusLabel(status: string) {
  const labels: Record<string, string> = {
    created: "Создан",
    pending_confirmation: "Ждет подтверждения ресторана",
    accepted: "Подтвержден рестораном",
    preparing: "Готовится",
    ready_for_pickup: "Готов к выдаче",
    courier_assigned: "Курьер назначен",
    picked_up: "Курьер забрал заказ",
    delivering: "В пути",
    delivered: "Доставлен",
    cancelled: "Отменен",
  };

  return labels[status] ?? status;
}

export function getPaymentMethodLabel(method: string) {
  const labels: Record<string, string> = {
    cash_to_courier: "Наличными курьеру",
    online_card: "Онлайн картой",
  };

  return labels[method] ?? method;
}

export function getPaymentStatusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: "Ожидает оплаты",
    authorized: "Авторизован",
    paid: "Оплачен",
    failed: "Ошибка оплаты",
    cancelled: "Отменен",
    refunded: "Возвращен",
    partially_refunded: "Частично возвращен",
  };

  return labels[status] ?? status;
}

export function getDeliveryStatusLabel(status: string) {
  const labels: Record<string, string> = {
    pending_assignment: "Ищем курьера",
    assigned: "Курьер назначен",
    picked_up: "Заказ забран",
    delivering: "В пути",
    delivered: "Доставлен",
    cancelled: "Отменен",
  };

  return labels[status] ?? status;
}

function formatOrderAddress(
  address: {
    city: string;
    addressLine: string;
    apartment?: string | null;
    entrance?: string | null;
    floor?: string | null;
  } | null,
) {
  if (!address) {
    return "Адрес не указан";
  }

  return [
    `${address.city}, ${address.addressLine}`,
    address.apartment && `кв. ${address.apartment}`,
    address.entrance && `подъезд ${address.entrance}`,
    address.floor && `этаж ${address.floor}`,
  ]
    .filter(Boolean)
    .join(", ");
}

export async function getCustomerOrders(customerId: string) {
  const prisma = getPrisma();

  const orders = await prisma.order.findMany({
    where: { customerId },
    orderBy: { createdAt: "desc" },
    include: {
      financials: true,
      items: true,
      delivery: true,
      restaurant: {
        include: {
          translations: true,
        },
      },
    },
  });

  return orders.map((order) => {
    const restaurantRu = order.restaurant.translations.find(
      (translation) => translation.language === "ru",
    );
    return {
      id: order.id,
      number: order.publicNumber,
      createdAt: order.createdAt,
      restaurant: restaurantRu?.name ?? order.restaurant.slug,
      status: order.status,
      statusLabel: getOrderStatusLabel(order.status),
      paymentMethod: getPaymentMethodLabel(order.paymentMethod),
      paymentStatus: getPaymentStatusLabel(order.paymentStatus),
      deliveryStatus: order.delivery?.status ?? "pending_assignment",
      itemsCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
      total: order.financials ? formatKzt(order.financials.customerTotal) : "-",
    };
  });
}

export async function getCustomerOrderByPublicNumber(input: {
  customerId: string;
  publicNumber: string;
}) {
  const prisma = getPrisma();

  const order = await prisma.order.findFirst({
    where: {
      customerId: input.customerId,
      publicNumber: input.publicNumber,
    },
    include: {
      delivery: {
        include: {
          courier: {
            include: {
              profile: true,
            },
          },
          offers: {
            orderBy: { offeredAt: "desc" },
            take: 1,
            include: {
              courier: {
                include: {
                  profile: true,
                },
              },
            },
          },
        },
      },
      deliveryAddress: true,
      deliveryFeeCalculation: true,
      financials: true,
      items: true,
      payments: true,
      promoRedemptions: {
        include: {
          promocode: true,
        },
      },
      restaurant: {
        include: {
          translations: true,
        },
      },
      statusHistory: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!order) {
    return null;
  }

  const restaurantRu = order.restaurant.translations.find(
    (translation) => translation.language === "ru",
  );

  return {
    ...order,
    restaurantName: restaurantRu?.name ?? order.restaurant.slug,
    statusLabel: getOrderStatusLabel(order.status),
    paymentMethodLabel: getPaymentMethodLabel(order.paymentMethod),
    paymentStatusLabel: getPaymentStatusLabel(order.paymentStatus),
  };
}

export async function getRestaurantDashboard(userId: string) {
  const prisma = getPrisma();
  await expireCourierOffers();

  const activeStatuses: OrderStatus[] = [
    "pending_confirmation",
    "accepted",
    "preparing",
    "ready_for_pickup",
    "courier_assigned",
  ];

  const staff = await prisma.restaurantStaff.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
    include: {
      restaurant: {
        include: {
          translations: true,
          balance: true,
        },
      },
    },
  });

  if (!staff) {
    return null;
  }

  const restaurantRu = staff.restaurant.translations.find(
    (translation) => translation.language === "ru",
  );
  const restaurantId = staff.restaurantId;

  const [
    newOrders,
    accepted,
    preparing,
    readyForPickup,
    menuUnavailable,
    activeOrders,
  ] = await Promise.all([
    prisma.order.count({
      where: { restaurantId, status: "pending_confirmation" },
    }),
    prisma.order.count({
      where: { restaurantId, status: "accepted" },
    }),
    prisma.order.count({
      where: { restaurantId, status: "preparing" },
    }),
    prisma.order.count({
      where: { restaurantId, status: "ready_for_pickup" },
    }),
    prisma.menuItem.count({
      where: { restaurantId, isAvailable: false },
    }),
    prisma.order.findMany({
      where: {
        restaurantId,
        status: { in: activeStatuses },
      },
      orderBy: { createdAt: "asc" },
      include: {
        customer: {
          select: {
            name: true,
            phone: true,
          },
        },
        delivery: {
          include: {
            courier: {
              include: {
                profile: true,
              },
            },
            offers: {
              where: { status: "pending" },
              orderBy: { offeredAt: "desc" },
              take: 1,
              include: {
                courier: {
                  include: {
                    profile: true,
                  },
                },
              },
            },
          },
        },
        deliveryAddress: true,
        financials: true,
        items: {
          orderBy: { createdAt: "asc" },
        },
      },
    }),
  ]);

  return {
    restaurant: {
      id: staff.restaurant.id,
      name: restaurantRu?.name ?? staff.restaurant.slug,
      addressLine: staff.restaurant.addressLine,
      role: staff.role,
      balance: formatKzt(staff.restaurant.balance?.balance ?? 0),
    },
    stats: {
      newOrders,
      accepted,
      preparing,
      readyForPickup,
      menuUnavailable,
    },
    orders: activeOrders.map((order) => {
      const pendingOffer = order.delivery?.offers[0] ?? null;
      const courierName = order.delivery?.courier?.profile?.fullName;
      const offeredCourierName = pendingOffer?.courier.profile?.fullName;
      const dispatchLabel = courierName
        ? `Курьер: ${courierName}`
        : pendingOffer
          ? `Ожидает ответа курьера: ${offeredCourierName ?? "курьер"}`
          : order.status === "pending_confirmation"
            ? "Диспетчеризация начнется после принятия"
            : "Курьер не назначен";
      const addressParts = order.deliveryAddress
        ? [
            `${order.deliveryAddress.city}, ${order.deliveryAddress.addressLine}`,
            order.deliveryAddress.apartment &&
              `кв. ${order.deliveryAddress.apartment}`,
            order.deliveryAddress.entrance &&
              `подъезд ${order.deliveryAddress.entrance}`,
            order.deliveryAddress.floor && `этаж ${order.deliveryAddress.floor}`,
          ].filter(Boolean)
        : [];

      return {
        id: order.id,
        number: order.publicNumber,
        status: order.status,
        statusLabel: getOrderStatusLabel(order.status),
        createdAt: order.createdAt,
        customerName: order.customer.name ?? order.customer.phone,
        customerPhone: order.customer.phone,
        customerComment: order.customerComment,
        restaurantComment: order.restaurantComment,
        addressLine: addressParts.join(", ") || "Адрес не указан",
        dispatchLabel,
        itemsCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
        items: order.items.map((item) => ({
          id: item.id,
          name: item.nameSnapshot,
          quantity: item.quantity,
          unitPrice: formatKzt(item.unitPrice),
          totalPrice: formatKzt(item.totalPrice),
        })),
        itemsSubtotal: order.financials
          ? formatKzt(order.financials.itemsSubtotal)
          : "-",
        deliveryFee: order.financials
          ? formatKzt(order.financials.deliveryFee)
          : "-",
        serviceFee: order.financials
          ? formatKzt(order.financials.serviceFee)
          : "-",
        customerTotal: order.financials
          ? formatKzt(order.financials.customerTotal)
          : "-",
      };
    }),
  };
}

export async function getOperatorOrders() {
  const prisma = getPrisma();
  await expireCourierOffers();

  const orders = await prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    include: {
      financials: true,
      restaurant: {
        include: {
          translations: true,
        },
      },
      delivery: {
        include: {
          courier: {
            include: {
              profile: true,
            },
          },
          offers: {
            orderBy: { offeredAt: "desc" },
            take: 1,
            include: {
              courier: {
                include: {
                  profile: true,
                },
              },
            },
          },
        },
      },
    },
  });

  return orders.map((order) => {
    const restaurantRu = order.restaurant.translations.find(
      (translation) => translation.language === "ru",
    );
    const latestOffer = order.delivery?.offers[0] ?? null;
    const pendingOffer =
      latestOffer?.status === "pending" ? latestOffer : null;
    const assignedCourierName = order.delivery?.courier?.profile?.fullName;
    const needsCourier =
      order.delivery?.status === "pending_assignment" &&
      ["accepted", "preparing", "ready_for_pickup"].includes(order.status);
    let dispatchState = "Не назначен";

    if (assignedCourierName) {
      if (order.delivery?.status === "assigned") {
        dispatchState =
          order.status === "ready_for_pickup"
            ? `Готов к выдаче, курьер назначен: ${assignedCourierName}`
            : `Курьер назначен, ресторан готовит: ${assignedCourierName}`;
      } else if (order.delivery?.status === "picked_up") {
        dispatchState = `Курьер забрал заказ: ${assignedCourierName}`;
      } else if (order.delivery?.status === "delivering") {
        dispatchState = `Курьер в пути: ${assignedCourierName}`;
      } else if (order.delivery?.status === "delivered") {
        dispatchState = `Доставлено: ${assignedCourierName}`;
      } else {
        dispatchState = `Назначен: ${assignedCourierName}`;
      }
    } else if (pendingOffer) {
      dispatchState = `Ожидает ответа: ${
        pendingOffer.courier.profile?.fullName ?? "курьер"
      }`;
    } else if (needsCourier) {
      dispatchState = "Нет доступных курьеров";
    }

    return {
      number: order.publicNumber,
      restaurant: restaurantRu?.name ?? order.restaurant.slug,
      status: getOrderStatusLabel(order.status),
      total: order.financials ? formatKzt(order.financials.customerTotal) : "-",
      dispatchState,
      courier: order.delivery?.courier?.profile?.fullName ?? "Не назначен",
    };
  });
}

export async function getCourierDashboard(userId: string) {
  const prisma = getPrisma();
  const now = new Date();
  await expireCourierOffers(now);

  const courier = await prisma.courier.findUnique({
    where: { userId },
    include: {
      availability: true,
      balance: true,
      profile: true,
      offers: {
        where: {
          status: "pending",
          expiresAt: { gt: now },
        },
        orderBy: { offeredAt: "asc" },
        include: {
          delivery: {
            include: {
              order: {
                include: {
                  deliveryAddress: true,
                  financials: true,
                  items: true,
                  restaurant: {
                    include: {
                      translations: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
      deliveries: {
        where: {
          status: {
            in: ["assigned", "picked_up", "delivering"],
          },
        },
        orderBy: { assignedAt: "desc" },
        include: {
          order: {
            include: {
              deliveryAddress: true,
              financials: true,
              items: true,
              restaurant: {
                include: {
                  translations: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!courier) {
    return null;
  }

  return {
    courier: {
      status: courier.status,
      availabilityStatus: courier.availability?.status ?? "inactive",
      hasLocation: Boolean(
        courier.availability?.latitude && courier.availability.longitude,
      ),
      fullName: courier.profile?.fullName ?? "Курьер",
      transportType: courier.profile?.transportType ?? null,
      balance: formatKzt(courier.balance?.balance ?? 0),
    },
    stats: {
      pendingOffers: courier.offers.length,
      assignedCount: courier.deliveries.length,
      balance: formatKzt(courier.balance?.balance ?? 0),
    },
    offers: courier.offers.map((offer) => {
      const order = offer.delivery.order;
      const restaurantRu = order.restaurant.translations.find(
        (translation) => translation.language === "ru",
      );

      return {
        id: offer.id,
        sequence: offer.sequence,
        expiresAt: offer.expiresAt,
        orderNumber: order.publicNumber,
        restaurant: restaurantRu?.name ?? order.restaurant.slug,
        restaurantAddress: order.restaurant.addressLine,
        deliveryAddress: formatOrderAddress(order.deliveryAddress),
        customerTotal: order.financials
          ? formatKzt(order.financials.customerTotal)
          : "-",
        deliveryFee: order.financials
          ? formatKzt(order.financials.deliveryFee)
          : "-",
        itemsCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
      };
    }),
    assignedDeliveries: courier.deliveries.map((delivery) => {
      const order = delivery.order;
      const restaurantRu = order.restaurant.translations.find(
        (translation) => translation.language === "ru",
      );

      return {
        id: delivery.id,
        status: delivery.status,
        statusLabel: getDeliveryStatusLabel(delivery.status),
        orderStatus: order.status,
        orderStatusLabel: getOrderStatusLabel(order.status),
        assignedAt: delivery.assignedAt,
        orderNumber: order.publicNumber,
        restaurant: restaurantRu?.name ?? order.restaurant.slug,
        restaurantAddress: order.restaurant.addressLine,
        deliveryAddress: formatOrderAddress(order.deliveryAddress),
        customerTotal: order.financials
          ? formatKzt(order.financials.customerTotal)
          : "-",
        itemsCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
      };
    }),
  };
}
