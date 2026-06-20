import type {
  CourierAssignedDelivery,
  CourierStatus,
  CourierTransportType,
} from "@deliver/contracts/courier";
import type { OrderStatus } from "@deliver/contracts/domain";

export function getCourierStatusLabel(status: CourierStatus) {
  const labels: Record<CourierStatus, string> = {
    inactive: "Не на линии",
    available: "На линии",
    busy: "Выполняет заказ",
    suspended: "Доступ приостановлен",
  };

  return labels[status];
}

export function getTransportLabel(transport: CourierTransportType | null) {
  if (!transport) return "Не указан";

  const labels: Record<CourierTransportType, string> = {
    walking: "Пешком",
    bicycle: "Велосипед",
    scooter: "Скутер",
    car: "Автомобиль",
  };

  return labels[transport];
}

export function getOrderStatusLabel(status: OrderStatus) {
  const labels: Record<OrderStatus, string> = {
    created: "Создан",
    pending_confirmation: "Ждёт ресторан",
    accepted: "Принят рестораном",
    preparing: "Готовится",
    ready_for_pickup: "Готов к выдаче",
    courier_assigned: "Курьер назначен",
    picked_up: "Забран",
    delivering: "В пути",
    delivered: "Доставлен",
    cancelled: "Отменён",
  };

  return labels[status];
}

export function getDeliveryAction(delivery: CourierAssignedDelivery) {
  if (
    delivery.status === "assigned" &&
    delivery.orderStatus === "ready_for_pickup"
  ) {
    return {
      action: "pickup" as const,
      label: "Забрал заказ",
      detail: "Заказ готов. Заберите его у ресторана и подтвердите получение.",
    };
  }

  if (delivery.status === "assigned") {
    return {
      action: null,
      label: "Ожидаем ресторан",
      detail: "Курьер назначен, но ресторан ещё не отметил заказ готовым.",
    };
  }

  if (delivery.status === "picked_up") {
    return {
      action: "start" as const,
      label: "Начать доставку",
      detail: "Заказ у вас. Подтвердите выезд к клиенту.",
    };
  }

  if (delivery.status === "delivering") {
    return {
      action: "complete" as const,
      label: "Доставил",
      detail: "Передайте заказ, получите наличные и завершите доставку.",
    };
  }

  return {
    action: null,
    label: "Статус обновляется",
    detail: "Обновите экран, чтобы получить актуальный следующий шаг.",
  };
}

export function formatOfferTimeLeft(expiresAt: string, now = new Date()) {
  const seconds = Math.max(
    0,
    Math.ceil((new Date(expiresAt).getTime() - now.getTime()) / 1000),
  );

  if (seconds < 60) return `${seconds} сек`;

  return `${Math.ceil(seconds / 60)} мин`;
}
