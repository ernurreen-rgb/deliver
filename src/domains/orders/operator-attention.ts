export type OperatorAttentionLevel = "critical" | "warning" | "watch" | "normal";

export type OperatorAttention = {
  level: OperatorAttentionLevel;
  title: string;
  detail: string;
  action: string;
  ageLabel: string;
  isProblem: boolean;
  sortWeight: number;
};

const operatorAttentionRank: Record<OperatorAttentionLevel, number> = {
  critical: 0,
  warning: 1,
  watch: 2,
  normal: 3,
};

const operatorAttentionThresholds = {
  restaurantConfirmationMinutes: 5,
  restaurantPreparationMinutes: 30,
  courierPickupMinutes: 10,
  pickupToDeliveryStartMinutes: 10,
  deliveryInProgressMinutes: 45,
} as const;

export function minutesSince(date: Date | null | undefined, now: Date) {
  if (!date) {
    return 0;
  }

  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / 60_000));
}

function formatAgeLabel(minutes: number) {
  if (minutes < 1) {
    return "только что";
  }

  if (minutes < 60) {
    return `${minutes} мин`;
  }

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;

  return remainder > 0 ? `${hours} ч ${remainder} мин` : `${hours} ч`;
}

export function buildOperatorAttention(input: {
  orderStatus: string;
  deliveryStatus: string | null;
  hasDelivery: boolean;
  hasCourier: boolean;
  hasPendingOffer: boolean;
  hasRestaurantCoordinates: boolean;
  statusAgeMinutes: number;
  deliveryAgeMinutes: number;
}): OperatorAttention {
  let level: OperatorAttentionLevel = "normal";
  let title = "Идет штатно";
  let detail = "Заказ движется по обычному сценарию.";
  let action = "Наблюдать.";

  if (input.orderStatus === "pending_confirmation") {
    if (
      input.statusAgeMinutes >=
      operatorAttentionThresholds.restaurantConfirmationMinutes
    ) {
      level = "warning";
      title = "Ресторан не подтвердил заказ";
      detail = "Клиент уже ждет, а ресторан еще не принял заказ.";
      action = "Свяжитесь с рестораном или отмените заказ с причиной.";
    } else {
      level = "watch";
      title = "Ждем подтверждение ресторана";
      detail = "Автоматика начнет поиск курьера после принятия заказа.";
      action = "Пока вмешательство не требуется.";
    }
  } else if (
    !input.hasDelivery &&
    ["accepted", "preparing", "ready_for_pickup", "courier_assigned"].includes(
      input.orderStatus,
    )
  ) {
    level = "critical";
    title = "Доставка не создана";
    detail = "Заказ уже принят, но у него нет delivery-записи.";
    action = "Проверьте заказ вручную, курьера назначить нельзя.";
  } else if (
    input.deliveryStatus === "pending_assignment" &&
    !input.hasCourier
  ) {
    if (input.hasPendingOffer) {
      level = "watch";
      title = "Курьеру отправлено предложение";
      detail = "Автоматика ждет ответ и сама перейдет к следующему курьеру.";
      action = "Вмешательство нужно только если заказ зависнет без оффера.";
    } else if (!input.hasRestaurantCoordinates) {
      level = "critical";
      title = "Нет координат ресторана";
      detail = "Автопоиск не сможет ранжировать курьеров без точки ресторана.";
      action = "Заполните точку ресторана в админке или назначьте курьера вручную.";
    } else if (input.orderStatus === "ready_for_pickup") {
      level = "critical";
      title = "Заказ готов, но курьера нет";
      detail = "Ресторан уже ждет выдачу, а доставка не назначена.";
      action = "Перезапустите поиск или назначьте доступного курьера вручную.";
    } else {
      level = "warning";
      title = "Нет доступного курьера";
      detail = "Автопоиск не нашел курьера или все уже отказались.";
      action = "Назначьте курьера вручную, когда кто-то появится онлайн.";
    }
  } else if (input.deliveryStatus === "assigned") {
    if (
      input.orderStatus === "ready_for_pickup" &&
      input.deliveryAgeMinutes >= operatorAttentionThresholds.courierPickupMinutes
    ) {
      level = "warning";
      title = "Курьер не забирает готовый заказ";
      detail = "Заказ готов к выдаче, но доставка все еще в статусе назначена.";
      action = "Свяжитесь с курьером или снимите его до фактического забора.";
    } else if (
      input.orderStatus !== "ready_for_pickup" &&
      input.statusAgeMinutes >=
        operatorAttentionThresholds.restaurantPreparationMinutes
    ) {
      level = "warning";
      title = "Ресторан долго готовит";
      detail = "Курьер уже назначен, но ресторан долго не ставит готовность.";
      action = "Свяжитесь с рестораном, чтобы уточнить время готовности.";
    } else {
      level = "normal";
      title = "Курьер назначен";
      detail =
        input.orderStatus === "ready_for_pickup"
          ? "Курьер должен забрать готовый заказ."
          : "Ресторан готовит заказ, курьер закреплен.";
      action = "Наблюдать.";
    }
  } else if (
    input.deliveryStatus === "picked_up" &&
    input.deliveryAgeMinutes >=
      operatorAttentionThresholds.pickupToDeliveryStartMinutes
  ) {
    level = "warning";
    title = "Курьер забрал, но не начал доставку";
    detail = "После забора заказ долго не перешел в статус движения к клиенту.";
    action = "Свяжитесь с курьером и проверьте, не нужна ли помощь.";
  } else if (
    input.deliveryStatus === "delivering" &&
    input.deliveryAgeMinutes >=
      operatorAttentionThresholds.deliveryInProgressMinutes
  ) {
    level = "warning";
    title = "Доставка в пути слишком долго";
    detail = "Заказ долго находится в пути.";
    action = "Свяжитесь с курьером или клиентом.";
  }

  return {
    level,
    title,
    detail,
    action,
    ageLabel: formatAgeLabel(
      Math.max(input.statusAgeMinutes, input.deliveryAgeMinutes),
    ),
    isProblem: level === "critical" || level === "warning",
    sortWeight: operatorAttentionRank[level],
  };
}
