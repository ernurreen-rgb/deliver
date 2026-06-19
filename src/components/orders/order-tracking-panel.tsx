import type { OrderTimeline } from "@/domains/orders/timeline";

type OrderTrackingPanelProps = {
  courierName?: string | null;
  deliveryStatus: string;
  distanceKm?: string | null;
  orderStatus: string;
  orderStatusLabel: string;
  paymentStatusLabel: string;
  timeline: OrderTimeline;
};

type TrackingStep = {
  title: string;
  detail: string;
  statuses: string[];
};

const trackingSteps: TrackingStep[] = [
  {
    title: "Оформлен",
    detail: "Заказ принят системой",
    statuses: ["created", "pending_confirmation"],
  },
  {
    title: "Принят",
    detail: "Ресторан подтвердил",
    statuses: ["accepted"],
  },
  {
    title: "Готовится",
    detail: "Кухня в работе",
    statuses: ["preparing"],
  },
  {
    title: "К выдаче",
    detail: "Курьер или ресторан готовятся к передаче",
    statuses: ["ready_for_pickup", "courier_assigned"],
  },
  {
    title: "В пути",
    detail: "Курьер доставляет заказ",
    statuses: ["picked_up", "delivering"],
  },
  {
    title: "Доставлен",
    detail: "Заказ у клиента",
    statuses: ["delivered"],
  },
];

const deliveryStatusLabels: Record<string, string> = {
  pending_assignment: "Ищем курьера",
  assigned: "Курьер назначен",
  picked_up: "Курьер забрал заказ",
  delivering: "Курьер в пути",
  delivered: "Доставлен",
  cancelled: "Отменена",
};

function getActiveStepIndex(orderStatus: string) {
  const index = trackingSteps.findIndex((step) =>
    step.statuses.includes(orderStatus),
  );

  return index === -1 ? 0 : index;
}

function getStepClassName(state: "done" | "current" | "next" | "cancelled") {
  if (state === "cancelled") {
    return "border-warning/35 bg-warning/10 text-warning";
  }

  if (state === "done") {
    return "border-accent bg-accent text-accent-foreground";
  }

  if (state === "current") {
    return "border-accent bg-accent/10 text-accent";
  }

  return "border-border bg-surface-muted text-foreground/45";
}

export function OrderTrackingPanel({
  courierName,
  deliveryStatus,
  distanceKm,
  orderStatus,
  orderStatusLabel,
  paymentStatusLabel,
  timeline,
}: OrderTrackingPanelProps) {
  const isCancelled = orderStatus === "cancelled";
  const activeStepIndex = getActiveStepIndex(orderStatus);
  const progressPercent = isCancelled
    ? 100
    : Math.round((activeStepIndex / (trackingSteps.length - 1)) * 100);
  const progressClassName = isCancelled ? "bg-warning" : "bg-accent";
  const deliveryLabel = deliveryStatusLabels[deliveryStatus] ?? deliveryStatus;

  return (
    <section className="rounded-lg border border-border bg-surface p-5">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <div className="text-sm font-medium text-foreground/55">
            Трекинг заказа
          </div>
          <h2 className="mt-2 text-2xl font-semibold tracking-normal">
            {isCancelled ? "Заказ отменен" : timeline.currentStep.title}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-foreground/65">
            {timeline.currentStep.detail}
          </p>
          <div className="mt-4 rounded-md bg-surface-muted p-4">
            <div className="text-sm font-medium text-foreground/70">
              Следующий шаг
            </div>
            <div className="mt-1 text-sm leading-6 text-foreground/60">
              {timeline.nextStep.title}. {timeline.nextStep.detail}
            </div>
          </div>
        </div>

        <dl className="grid min-w-0 gap-3 sm:grid-cols-2 lg:w-80 lg:grid-cols-1">
          <div className="border-t border-border pt-3 first:border-t-0 first:pt-0 sm:border-t-0 lg:border-t lg:first:border-t-0">
            <dt className="text-xs font-medium uppercase tracking-normal text-foreground/45">
              Статус
            </dt>
            <dd className="mt-1 break-words text-sm font-semibold">
              {orderStatusLabel}
            </dd>
          </div>
          <div className="border-t border-border pt-3 sm:border-t-0 lg:border-t">
            <dt className="text-xs font-medium uppercase tracking-normal text-foreground/45">
              Оплата
            </dt>
            <dd className="mt-1 break-words text-sm font-semibold">
              {paymentStatusLabel}
            </dd>
          </div>
          <div className="border-t border-border pt-3">
            <dt className="text-xs font-medium uppercase tracking-normal text-foreground/45">
              Доставка
            </dt>
            <dd className="mt-1 break-words text-sm font-semibold">
              {deliveryLabel}
            </dd>
          </div>
          <div className="border-t border-border pt-3">
            <dt className="text-xs font-medium uppercase tracking-normal text-foreground/45">
              Курьер
            </dt>
            <dd className="mt-1 break-words text-sm font-semibold">
              {courierName ?? "Пока не назначен"}
            </dd>
          </div>
          <div className="border-t border-border pt-3 sm:col-span-2 lg:col-span-1">
            <dt className="text-xs font-medium uppercase tracking-normal text-foreground/45">
              Расстояние
            </dt>
            <dd className="mt-1 break-words text-sm font-semibold">
              {distanceKm ? `${distanceKm} км` : "Будет рассчитано"}
            </dd>
          </div>
        </dl>
      </div>

      <div
        aria-hidden="true"
        className="mt-6 h-2 overflow-hidden rounded-full bg-surface-muted"
      >
        <div
          className={`h-full rounded-full ${progressClassName}`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <ol className="mt-5 grid gap-4 md:grid-cols-6">
        {trackingSteps.map((step, index) => {
          const state = isCancelled
            ? "cancelled"
            : index < activeStepIndex
              ? "done"
              : index === activeStepIndex
                ? "current"
                : "next";
          const isCurrent = state === "current";
          const marker = state === "done" || orderStatus === "delivered"
            ? "✓"
            : index + 1;

          return (
            <li
              key={step.title}
              aria-current={isCurrent ? "step" : undefined}
              className="grid grid-cols-[2.25rem_1fr] gap-3 md:grid-cols-1"
            >
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-full border text-sm font-semibold ${getStepClassName(
                  state,
                )}`}
              >
                {marker}
              </span>
              <span className="min-w-0">
                <span
                  className={`block text-sm font-semibold ${
                    isCurrent ? "text-accent" : "text-foreground"
                  }`}
                >
                  {step.title}
                </span>
                <span className="mt-1 block text-xs leading-5 text-foreground/55">
                  {step.detail}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
