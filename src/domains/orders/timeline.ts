type TimelineActor = {
  id: string;
  name: string | null;
  phone: string;
};

type TimelineStatusHistory = {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  comment: string | null;
  createdAt: Date;
  changedBy?: TimelineActor | null;
};

type TimelineAuditLog = {
  id: string;
  action: string;
  metadata: unknown;
  createdAt: Date;
  actor?: TimelineActor | null;
};

export type OrderTimelineEvent = {
  id: string;
  occurredAt: Date;
  title: string;
  detail: string;
  actor: string;
  reason: string | null;
  source: "status" | "audit";
};

export type OrderTimeline = {
  currentStep: {
    title: string;
    detail: string;
  };
  nextStep: {
    title: string;
    detail: string;
  };
  events: OrderTimelineEvent[];
};

type BuildOrderTimelineInput = {
  order: {
    status: string;
  };
  delivery?: {
    status: string | null;
    hasCourier: boolean;
    hasPendingOffer: boolean;
  } | null;
  statusHistory: TimelineStatusHistory[];
  auditLogs: TimelineAuditLog[];
};

const orderStatusLabels: Record<string, string> = {
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

const supplementalAuditTitles: Record<string, string> = {
  courier_offer_rejected_v1: "Курьер отказался от предложения",
  courier_offer_expired_v1: "Предложение курьеру истекло",
  operator_created_delivery_v1: "Оператор создал доставку",
  operator_restarted_dispatch_v1: "Оператор перезапустил автоназначение",
  finance_closed_v1: "Финансы закрыты",
};

function getOrderStatusLabel(status: string) {
  return orderStatusLabels[status] ?? status;
}

function getActorLabel(actor?: TimelineActor | null) {
  if (!actor) {
    return "Система";
  }

  return actor.name ?? actor.phone;
}

function getMetadataValue(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : null;
}

function getAuditDetail(log: TimelineAuditLog) {
  const reason = getMetadataValue(log.metadata, "reason");
  const result = getMetadataValue(log.metadata, "result");
  const paymentMethod = getMetadataValue(log.metadata, "paymentMethod");

  if (reason) {
    return `Причина: ${reason}`;
  }

  if (result) {
    return `Результат: ${result}`;
  }

  if (paymentMethod) {
    return `Метод оплаты: ${paymentMethod}`;
  }

  return "Событие записано в журнал аудита.";
}

function getStatusDetail(event: TimelineStatusHistory) {
  const fromLabel = event.fromStatus
    ? getOrderStatusLabel(event.fromStatus)
    : "Начало";
  const toLabel = getOrderStatusLabel(event.toStatus);

  return `${fromLabel} -> ${toLabel}`;
}

function getCurrentAndNextStep(input: BuildOrderTimelineInput) {
  const deliveryStatus = input.delivery?.status ?? null;
  const hasCourier = input.delivery?.hasCourier ?? false;
  const hasPendingOffer = input.delivery?.hasPendingOffer ?? false;

  if (input.order.status === "cancelled") {
    return {
      currentStep: {
        title: "Заказ отменен",
        detail: "Дальнейших действий по заказу нет.",
      },
      nextStep: {
        title: "Нет следующего шага",
        detail: "Заказ закрыт отменой.",
      },
    };
  }

  if (input.order.status === "delivered") {
    return {
      currentStep: {
        title: "Заказ доставлен",
        detail: "Клиент получил заказ.",
      },
      nextStep: {
        title: "Заказ завершен",
        detail: "Остается сверка истории и финансов.",
      },
    };
  }

  if (deliveryStatus === "pending_assignment" && hasPendingOffer) {
    return {
      currentStep: {
        title: "Ждем ответ курьера",
        detail: "Заказ предложен ближайшему доступному курьеру.",
      },
      nextStep: {
        title: "Курьер принимает или отказывается",
        detail: "Если ответа не будет, система попробует следующего курьера.",
      },
    };
  }

  if (deliveryStatus === "pending_assignment" && !hasCourier) {
    return {
      currentStep: {
        title: "Курьер не назначен",
        detail: "Система ищет курьера или ждет вмешательства оператора.",
      },
      nextStep: {
        title: "Назначить курьера",
        detail: "Автоназначение или оператор закрепит доступного курьера.",
      },
    };
  }

  if (input.order.status === "pending_confirmation") {
    return {
      currentStep: {
        title: "Ждем ресторан",
        detail: "Ресторан должен принять или отклонить заказ.",
      },
      nextStep: {
        title: "Ресторан подтверждает заказ",
        detail: "После подтверждения начнется приготовление и поиск курьера.",
      },
    };
  }

  if (input.order.status === "accepted" || input.order.status === "preparing") {
    return {
      currentStep: {
        title: "Ресторан готовит",
        detail: "Заказ подтвержден и находится на стороне ресторана.",
      },
      nextStep: {
        title: "Отметить готовность",
        detail: "Ресторан отметит заказ готовым к выдаче.",
      },
    };
  }

  if (input.order.status === "courier_assigned") {
    return {
      currentStep: {
        title: "Курьер назначен",
        detail: "Курьер закреплен за заказом, ресторан продолжает подготовку.",
      },
      nextStep: {
        title: "Дождаться готовности",
        detail: "После готовности курьер сможет забрать заказ.",
      },
    };
  }

  if (input.order.status === "ready_for_pickup") {
    return {
      currentStep: {
        title: "Готов к выдаче",
        detail: hasCourier
          ? "Курьер может забрать заказ у ресторана."
          : "Заказ готов, но курьер еще не закреплен.",
      },
      nextStep: {
        title: hasCourier ? "Курьер забирает заказ" : "Назначить курьера",
        detail: hasCourier
          ? "Следующий статус появится после получения заказа курьером."
          : "Система или оператор должны закрепить курьера.",
      },
    };
  }

  if (input.order.status === "picked_up") {
    return {
      currentStep: {
        title: "Курьер забрал заказ",
        detail: "Заказ уже у курьера.",
      },
      nextStep: {
        title: "Начать доставку",
        detail: "Курьер переведет заказ в путь.",
      },
    };
  }

  if (input.order.status === "delivering") {
    return {
      currentStep: {
        title: "Курьер в пути",
        detail: "Заказ доставляется клиенту.",
      },
      nextStep: {
        title: "Завершить доставку",
        detail: "После доставки закроются заказ и финансы.",
      },
    };
  }

  return {
    currentStep: {
      title: getOrderStatusLabel(input.order.status),
      detail: "Заказ находится в рабочем процессе.",
    },
    nextStep: {
      title: "Ожидается следующее действие",
      detail: "Следующий шаг зависит от текущего статуса заказа.",
    },
  };
}

export function buildOrderTimeline(
  input: BuildOrderTimelineInput,
): OrderTimeline {
  const statusEvents = input.statusHistory.map((event) => ({
    id: `status-${event.id}`,
    occurredAt: event.createdAt,
    title: getOrderStatusLabel(event.toStatus),
    detail: getStatusDetail(event),
    actor: getActorLabel(event.changedBy),
    reason: event.comment,
    source: "status" as const,
  }));

  const auditEvents = input.auditLogs
    .filter((log) => supplementalAuditTitles[log.action])
    .map((log) => ({
      id: `audit-${log.id}`,
      occurredAt: log.createdAt,
      title: supplementalAuditTitles[log.action],
      detail: getAuditDetail(log),
      actor: getActorLabel(log.actor),
      reason: getMetadataValue(log.metadata, "reason"),
      source: "audit" as const,
    }));

  const events = [...statusEvents, ...auditEvents].sort(
    (left, right) => right.occurredAt.getTime() - left.occurredAt.getTime(),
  );

  return {
    ...getCurrentAndNextStep(input),
    events,
  };
}
