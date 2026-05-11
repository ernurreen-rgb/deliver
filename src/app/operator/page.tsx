import { InfoTile } from "@/components/shared/info-tile";
import { SurfaceShell } from "@/components/layout/surface-shell";
import { requireAnyRole } from "@/domains/auth/authorization";
import {
  assignCourierManuallyAction,
  cancelOrderByOperatorAction,
  retryCourierDispatchAction,
  unassignCourierAction,
} from "@/domains/delivery/operator-actions";
import {
  getOperatorAvailableCouriers,
  getOperatorOrders,
} from "@/domains/orders/queries";

export const dynamic = "force-dynamic";

type OperatorPageProps = {
  searchParams: Promise<{
    error?: string;
    updated?: string;
  }>;
};

type OperatorOrder = Awaited<ReturnType<typeof getOperatorOrders>>[number];
type AvailableCourier = Awaited<
  ReturnType<typeof getOperatorAvailableCouriers>
>[number];

const dateFormatter = new Intl.DateTimeFormat("ru-KZ", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const errorMessages: Record<string, string> = {
  active_offer_exists: "У доставки уже есть активное предложение курьеру.",
  already_assigned: "Курьер уже назначен.",
  courier_not_found: "Курьер не найден.",
  courier_required: "Выберите курьера.",
  courier_unavailable: "Курьер уже занят или недоступен.",
  delivery_not_found: "Доставка не найдена.",
  delivery_required: "Не передана доставка.",
  input_too_long: "Текст слишком длинный.",
  invalid_delivery_status: "Статус доставки уже изменился.",
  invalid_order_status: "Статус заказа уже изменился.",
  missing_restaurant_coordinates: "У ресторана нет координат для поиска курьера.",
  no_available_couriers: "Сейчас нет доступных курьеров.",
  order_not_dispatchable: "Для этого статуса заказа нельзя искать курьера.",
  order_not_found: "Заказ не найден.",
  order_required: "Не передан заказ.",
  reason_required: "Укажите причину отмены.",
};

function statusClassName(status: string) {
  if (status === "pending_confirmation") {
    return "bg-warning/10 text-warning";
  }

  if (status === "ready_for_pickup" || status === "picked_up") {
    return "bg-accent/10 text-accent";
  }

  return "bg-surface-muted text-foreground/70";
}

function OperatorControls({
  availableCouriers,
  order,
}: {
  availableCouriers: AvailableCourier[];
  order: OperatorOrder;
}) {
  const canAssignFromList = order.canAssignCourier && availableCouriers.length > 0;

  return (
    <div className="grid gap-3 border-t border-border pt-4">
      <div className="flex flex-wrap gap-3">
        {order.canRetryDispatch && order.deliveryId ? (
          <form action={retryCourierDispatchAction}>
            <input name="deliveryId" type="hidden" value={order.deliveryId} />
            <button
              type="submit"
              className="h-10 rounded-md border border-border px-4 text-sm font-medium text-foreground/75 transition-colors hover:border-accent hover:text-accent"
            >
              Перезапустить поиск
            </button>
          </form>
        ) : null}

        {order.canUnassignCourier && order.deliveryId ? (
          <form action={unassignCourierAction}>
            <input name="deliveryId" type="hidden" value={order.deliveryId} />
            <button
              type="submit"
              className="h-10 rounded-md border border-warning/35 px-4 text-sm font-medium text-warning transition-colors hover:bg-warning/10"
            >
              Снять курьера
            </button>
          </form>
        ) : null}
      </div>

      {canAssignFromList && order.deliveryId ? (
        <form
          action={assignCourierManuallyAction}
          className="grid gap-3 sm:grid-cols-[minmax(180px,1fr)_auto]"
        >
          <input name="deliveryId" type="hidden" value={order.deliveryId} />
          <select
            name="courierId"
            className="h-10 rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-accent"
            defaultValue=""
          >
            <option value="" disabled>
              Выберите курьера
            </option>
            {availableCouriers.map((courier) => (
              <option key={courier.id} value={courier.id}>
                {courier.name} · {courier.phone}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="h-10 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground"
          >
            Назначить
          </button>
        </form>
      ) : order.canAssignCourier ? (
        <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
          Нет доступных курьеров для ручного назначения.
        </div>
      ) : null}

      {order.canCancel ? (
        <form
          action={cancelOrderByOperatorAction}
          className="grid gap-3 sm:grid-cols-[minmax(220px,1fr)_auto]"
        >
          <input name="orderId" type="hidden" value={order.id} />
          <input
            name="reason"
            maxLength={500}
            placeholder="Причина отмены"
            className="h-10 rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-warning"
          />
          <button
            type="submit"
            className="h-10 rounded-md border border-warning/35 px-4 text-sm font-medium text-warning transition-colors hover:bg-warning/10"
          >
            Отменить заказ
          </button>
        </form>
      ) : null}
    </div>
  );
}

export default async function OperatorPage({ searchParams }: OperatorPageProps) {
  await requireAnyRole(["operator", "admin"]);

  const params = await searchParams;
  const [operatorQueue, availableCouriers] = await Promise.all([
    getOperatorOrders(),
    getOperatorAvailableCouriers(),
  ]);
  const errorMessage = params.error ? errorMessages[params.error] : null;
  const needsCourier = operatorQueue.filter(
    (order) => order.canAssignCourier && !order.latestOffer,
  ).length;
  const waitingCourier = operatorQueue.filter(
    (order) => order.latestOffer?.status === "pending",
  ).length;
  const assignedDeliveries = operatorQueue.filter((order) =>
    ["assigned", "picked_up", "delivering"].includes(order.deliveryStatus ?? ""),
  ).length;

  return (
    <SurfaceShell
      title="Панель оператора"
      description="Оператор видит заказы, состояние автоназначения и может вручную управлять доставкой."
    >
      {params.updated ? (
        <div className="mb-5 rounded-lg border border-accent/30 bg-accent/10 p-4 text-sm text-accent">
          Действие выполнено: {params.updated}.
        </div>
      ) : null}
      {errorMessage ? (
        <div className="mb-5 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
          {errorMessage}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-4">
        <InfoTile label="Активные" value={String(operatorQueue.length)} />
        <InfoTile
          label="Без курьера"
          value={String(needsCourier)}
          tone={needsCourier > 0 ? "warning" : "default"}
        />
        <InfoTile
          label="Ждут ответ"
          value={String(waitingCourier)}
          tone={waitingCourier > 0 ? "accent" : "default"}
        />
        <InfoTile
          label="Курьеры онлайн"
          value={String(availableCouriers.length)}
          tone={availableCouriers.length > 0 ? "accent" : "warning"}
        />
      </div>

      <section className="mt-6 rounded-lg border border-border bg-surface p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Очередь заказов</h2>
            <p className="mt-1 text-sm text-foreground/60">
              Активных доставок: {assignedDeliveries}. Ручное снятие доступно до
              момента, когда курьер забрал заказ.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-4">
          {operatorQueue.length > 0 ? (
            operatorQueue.map((order) => (
              <article
                key={order.id}
                className="grid gap-4 rounded-lg border border-border bg-background p-4"
              >
                <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="font-semibold">{order.number}</span>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-medium ${statusClassName(order.status)}`}
                      >
                        {order.statusLabel}
                      </span>
                      {order.deliveryStatusLabel ? (
                        <span className="rounded-full bg-surface-muted px-3 py-1 text-xs font-medium text-foreground/70">
                          {order.deliveryStatusLabel}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-2 text-sm text-foreground/65">
                      {order.restaurant} · {order.customer} ·{" "}
                      {order.customerPhone}
                    </div>
                    <div className="mt-1 text-sm text-foreground/65">
                      {order.address}
                    </div>
                    <div className="mt-2 text-sm font-medium text-foreground/75">
                      {order.dispatchState}
                    </div>
                    {order.latestOffer ? (
                      <div className="mt-1 text-sm text-foreground/55">
                        Последнее предложение: {order.latestOffer.courier} ·{" "}
                        {order.latestOffer.status}
                        {order.latestOffer.status === "pending"
                          ? ` до ${dateFormatter.format(order.latestOffer.expiresAt)}`
                          : ""}
                      </div>
                    ) : null}
                  </div>
                  <div className="lg:text-right">
                    <div className="text-lg font-semibold">{order.total}</div>
                    <div className="mt-1 text-sm text-foreground/55">
                      Курьер: {order.courier}
                    </div>
                  </div>
                </div>

                <OperatorControls
                  availableCouriers={availableCouriers}
                  order={order}
                />
              </article>
            ))
          ) : (
            <div className="rounded-lg border border-dashed border-border p-6 text-sm text-foreground/60">
              Активных заказов сейчас нет.
            </div>
          )}
        </div>
      </section>
    </SurfaceShell>
  );
}
