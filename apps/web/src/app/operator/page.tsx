import Link from "next/link";
import Form from "next/form";
import { InfoTile } from "@/components/shared/info-tile";
import { SurfaceShell } from "@/components/layout/surface-shell";
import { OrderTimelinePanel } from "@/components/orders/order-timeline";
import { PendingSubmitButton } from "@/components/shared/pending-submit-button";
import { RouteAutoRefresh } from "@/components/shared/route-auto-refresh";
import { requireAnyRole } from "@/domains/auth/authorization";
import {
  assignCourierManuallyAction,
  cancelOrderByOperatorAction,
  createDeliveryForOrderAction,
  resolveFinancialReviewAction,
  retryCourierDispatchAction,
  unassignCourierAction,
} from "@/domains/delivery/operator-actions";
import {
  getOperatorAvailableCouriers,
  getOperatorOrders,
  getOperatorPilotJournal,
} from "@/domains/orders/queries";

export const dynamic = "force-dynamic";

type OperatorPageProps = {
  searchParams: Promise<{
    error?: string;
    q?: string;
    scope?: string;
    updated?: string;
  }>;
};

type OperatorOrder = Awaited<ReturnType<typeof getOperatorOrders>>[number];
type AvailableCourier = Awaited<
  ReturnType<typeof getOperatorAvailableCouriers>
>[number];
type PilotJournal = Awaited<ReturnType<typeof getOperatorPilotJournal>>;
type PilotJournalOrder = PilotJournal["orders"][number];

const dateFormatter = new Intl.DateTimeFormat("ru-KZ", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const timeFormatter = new Intl.DateTimeFormat("ru-KZ", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

const errorMessages: Record<string, string> = {
  financial_review_already_resolved: "Финансовая сверка уже закрыта.",
  financial_review_not_found: "Финансовая сверка не найдена.",
  invalid_financial_review_resolution: "Выберите корректное решение сверки.",
  active_offer_exists: "У доставки уже есть активное предложение курьеру.",
  already_assigned: "Курьер уже назначен.",
  courier_not_found: "Курьер не найден.",
  courier_required: "Выберите курьера.",
  courier_unavailable: "Курьер уже занят или недоступен.",
  delivery_already_exists: "Доставка для заказа уже создана.",
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

const operatorScopeOptions = [
  { value: "all", label: "Все заказы" },
  { value: "problem", label: "Требуют внимания" },
  { value: "delayed", label: "Опаздывает" },
  { value: "waiting_restaurant", label: "Ждет ресторан" },
  { value: "no_courier", label: "Без курьера" },
  { value: "en_route", label: "В пути" },
  { value: "financial", label: "Финансовая сверка" },
  { value: "dispatch", label: "Нужен курьер" },
  { value: "waiting_offer", label: "Ждем курьера" },
  { value: "active", label: "Активные" },
] as const;

type OperatorScope = (typeof operatorScopeOptions)[number]["value"];

function resolveOperatorScope(value: string | undefined): OperatorScope {
  return operatorScopeOptions.some((option) => option.value === value)
    ? (value as OperatorScope)
    : "all";
}

function buildOperatorHref(scope: OperatorScope, query: string) {
  const params = new URLSearchParams();

  if (scope !== "all") {
    params.set("scope", scope);
  }

  if (query) {
    params.set("q", query);
  }

  const search = params.toString();
  return search ? `/operator?${search}` : "/operator";
}

function isOrderActive(order: OperatorOrder) {
  return order.status !== "cancelled" && order.status !== "delivered";
}

function isWaitingRestaurant(order: OperatorOrder) {
  return order.status === "pending_confirmation";
}

function isWithoutCourier(order: OperatorOrder) {
  return (
    order.canCreateDelivery ||
    order.canAssignCourier ||
    order.canRetryDispatch ||
    order.latestOffer?.status === "pending"
  );
}

function isEnRoute(order: OperatorOrder) {
  return order.deliveryStatus === "picked_up" || order.deliveryStatus === "delivering";
}

function isDelayedOrder(order: OperatorOrder) {
  return order.attention.isProblem && !order.requiresFinancialReview;
}

function statusClassName(status: string) {
  if (status === "pending_confirmation") {
    return "bg-warning/10 text-warning";
  }

  if (status === "ready_for_pickup" || status === "picked_up") {
    return "bg-accent/10 text-accent";
  }

  return "bg-surface-muted text-foreground/70";
}

function orderMatchesScope(order: OperatorOrder, scope: OperatorScope) {
  if (scope === "problem") {
    return order.attention.isProblem;
  }

  if (scope === "delayed") {
    return isDelayedOrder(order);
  }

  if (scope === "waiting_restaurant") {
    return isWaitingRestaurant(order);
  }

  if (scope === "no_courier") {
    return isWithoutCourier(order);
  }

  if (scope === "en_route") {
    return isEnRoute(order);
  }

  if (scope === "financial") {
    return order.requiresFinancialReview;
  }

  if (scope === "dispatch") {
    return order.canCreateDelivery || order.canAssignCourier || order.canRetryDispatch;
  }

  if (scope === "waiting_offer") {
    return order.latestOffer?.status === "pending";
  }

  if (scope === "active") {
    return isOrderActive(order);
  }

  return true;
}

function orderMatchesQuery(order: OperatorOrder, query: string) {
  if (!query) {
    return true;
  }

  const normalizedQuery = query.toLowerCase();
  const searchableText = [
    order.number,
    order.restaurant,
    order.customer,
    order.customerPhone,
    order.address,
    order.statusLabel,
    order.deliveryStatusLabel,
    order.dispatchState,
    order.courier,
    order.latestOffer?.courier,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return searchableText.includes(normalizedQuery);
}

function attentionClassName(level: OperatorOrder["attention"]["level"]) {
  if (level === "critical" || level === "warning") {
    return "border-warning/35 bg-warning/10 text-warning";
  }

  if (level === "watch") {
    return "border-accent/30 bg-accent/10 text-accent";
  }

  return "border-border bg-surface-muted text-foreground/70";
}

function attentionLabel(level: OperatorOrder["attention"]["level"]) {
  const labels: Record<OperatorOrder["attention"]["level"], string> = {
    critical: "Срочно",
    warning: "Внимание",
    watch: "Автоматика",
    normal: "Штатно",
  };

  return labels[level];
}

function pilotJournalAttentionClassName(order: PilotJournalOrder) {
  if (order.needsAttention) {
    return "border-warning/35 bg-warning/10 text-warning";
  }

  if (order.status === "delivered") {
    return "border-accent/30 bg-accent/10 text-accent";
  }

  if (order.status === "cancelled") {
    return "border-border bg-surface-muted text-foreground/55";
  }

  return "border-border bg-surface-muted text-foreground/70";
}

function isPilotJournalOrderActive(order: PilotJournalOrder) {
  return order.status !== "delivered" && order.status !== "cancelled";
}

function PilotFocusOrderCard({ order }: { order: PilotJournalOrder }) {
  const isActive = isPilotJournalOrderActive(order);

  return (
    <section
      data-pilot-focus-order={order.number}
      className={`mt-6 rounded-lg border p-5 ${
        order.needsAttention
          ? "border-warning/35 bg-warning/5"
          : "border-accent/30 bg-accent/5"
      }`}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-sm font-medium text-foreground/55">
            Текущий pilot cash-order
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <span className="font-mono text-xl font-semibold">{order.number}</span>
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${statusClassName(
                order.status,
              )}`}
            >
              {order.statusLabel}
            </span>
            <span
              className={`rounded-full border px-3 py-1 text-xs font-medium ${pilotJournalAttentionClassName(
                order,
              )}`}
            >
              {order.attentionLabel}
            </span>
          </div>
          <div className="mt-2 text-sm leading-6 text-foreground/65">
            {order.restaurant} · {order.customer} · {order.cashState} ·{" "}
            {order.deliveryStatusLabel}
          </div>
        </div>

        <div className="grid gap-2 text-sm lg:min-w-52 lg:text-right">
          <div className="text-lg font-semibold">{order.total}</div>
          <div className="text-foreground/55">{order.ageLabel}</div>
          {isActive ? (
            <Link
              href={buildOperatorHref("all", order.number)}
              className="inline-flex h-10 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground"
            >
              Найти в очереди
            </Link>
          ) : (
            <div className="rounded-md border border-border bg-background px-3 py-2 text-foreground/60">
              Последний заказ закрыт
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function DispatcherScopeCard({
  count,
  currentScope,
  detail,
  label,
  query,
  scope,
  tone = "default",
}: {
  count: number;
  currentScope: OperatorScope;
  detail: string;
  label: string;
  query: string;
  scope: OperatorScope;
  tone?: "default" | "accent" | "warning";
}) {
  const isActive = currentScope === scope;
  const toneClassName = {
    default: isActive
      ? "border-foreground/35 bg-foreground/5"
      : "border-border bg-surface",
    accent: isActive
      ? "border-accent bg-accent/10 text-accent"
      : "border-accent/30 bg-accent/5 text-accent",
    warning: isActive
      ? "border-warning bg-warning/10 text-warning"
      : "border-warning/30 bg-warning/5 text-warning",
  }[tone];

  return (
    <Link
      href={buildOperatorHref(scope, query)}
      className={`grid gap-2 rounded-lg border p-4 transition-colors hover:border-accent ${toneClassName}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-2xl font-semibold tracking-normal">{count}</div>
      </div>
      <div className="text-xs leading-5 text-current/65">{detail}</div>
    </Link>
  );
}

function DispatcherLane({
  currentScope,
  detail,
  emptyText,
  orders,
  query,
  scope,
  title,
  tone = "default",
}: {
  currentScope: OperatorScope;
  detail: string;
  emptyText: string;
  orders: OperatorOrder[];
  query: string;
  scope: OperatorScope;
  title: string;
  tone?: "default" | "warning";
}) {
  const headingClassName =
    tone === "warning" ? "text-warning" : "text-foreground";

  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className={`text-sm font-semibold ${headingClassName}`}>
            {title}
          </h3>
          <p className="mt-1 text-xs leading-5 text-foreground/55">{detail}</p>
        </div>
        <Link
          href={buildOperatorHref(scope, query)}
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            currentScope === scope
              ? "bg-accent text-accent-foreground"
              : "bg-surface-muted text-foreground/65"
          }`}
        >
          {orders.length}
        </Link>
      </div>

      <div className="mt-4 grid gap-3">
        {orders.slice(0, 4).map((order) => (
          <Link
            key={order.id}
            href={buildOperatorHref(scope, query)}
            className="rounded-md border border-border bg-background p-3 transition-colors hover:border-accent"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-xs text-foreground/60">
                {order.number}
              </span>
              <span className="text-xs text-foreground/45">
                {order.attention.ageLabel}
              </span>
            </div>
            <div className="mt-2 text-sm font-medium">{order.restaurant}</div>
            <div className="mt-1 text-xs leading-5 text-foreground/60">
              {order.attention.title}
            </div>
          </Link>
        ))}
        {orders.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-4 text-xs leading-5 text-foreground/55">
            {emptyText}
          </div>
        ) : null}
        {orders.length > 4 ? (
          <Link
            href={buildOperatorHref(scope, query)}
            className="text-xs font-medium text-accent"
          >
            Показать еще {orders.length - 4}
          </Link>
        ) : null}
      </div>
    </section>
  );
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold">Быстрые действия</div>
        <div className="text-xs text-foreground/50">
          Доступны только безопасные для текущего статуса операции.
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        {order.canCreateDelivery ? (
          <form action={createDeliveryForOrderAction}>
            <input name="orderId" type="hidden" value={order.id} />
            <PendingSubmitButton
              pendingText="Создаем"
              className="h-10 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground"
            >
              Создать доставку
            </PendingSubmitButton>
          </form>
        ) : null}

        {order.canRetryDispatch && order.deliveryId ? (
          <form action={retryCourierDispatchAction}>
            <input name="deliveryId" type="hidden" value={order.deliveryId} />
            <PendingSubmitButton
              pendingText="Запускаем"
              className="h-10 rounded-md border border-border px-4 text-sm font-medium text-foreground/75 transition-colors hover:border-accent hover:text-accent"
            >
              Перезапустить поиск
            </PendingSubmitButton>
          </form>
        ) : null}

        {order.canUnassignCourier && order.deliveryId ? (
          <form action={unassignCourierAction}>
            <input name="deliveryId" type="hidden" value={order.deliveryId} />
            <PendingSubmitButton
              pendingText="Снимаем"
              className="h-10 rounded-md border border-warning/35 px-4 text-sm font-medium text-warning transition-colors hover:bg-warning/10"
            >
              Снять курьера
            </PendingSubmitButton>
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
          <PendingSubmitButton
            pendingText="Назначаем"
            className="h-10 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground"
          >
            Назначить
          </PendingSubmitButton>
        </form>
      ) : order.canAssignCourier ? (
        <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
          Нет доступных курьеров для ручного назначения.
        </div>
      ) : null}

      {order.requiresFinancialReview ? (
        <form
          action={resolveFinancialReviewAction}
          className="grid gap-3 rounded-md border border-warning/30 bg-warning/5 p-3"
        >
          <input name="orderId" type="hidden" value={order.id} />
          <div className="grid gap-3 sm:grid-cols-[minmax(180px,220px)_minmax(220px,1fr)_auto]">
            <select
              name="resolution"
              required
              className="h-10 rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-warning"
              defaultValue=""
            >
              <option value="" disabled>
                Решение сверки
              </option>
              <option value="cash_not_collected">Наличные не получены</option>
              <option value="manual_adjustment">Ручная корректировка</option>
            </select>
            <input
              name="note"
              maxLength={500}
              placeholder="Комментарий оператора"
              className="h-10 rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-warning"
            />
            <PendingSubmitButton
              pendingText="Закрываем"
              className="h-10 rounded-md bg-warning px-4 text-sm font-medium text-warning-foreground"
            >
              Сверка решена
            </PendingSubmitButton>
          </div>
        </form>
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
            required
            className="h-10 rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-warning"
          />
          <PendingSubmitButton
            pendingText="Отменяем"
            className="h-10 rounded-md border border-warning/35 px-4 text-sm font-medium text-warning transition-colors hover:bg-warning/10"
          >
            Отменить заказ
          </PendingSubmitButton>
        </form>
      ) : null}
    </div>
  );
}

function OperatorOrderCard({
  availableCouriers,
  order,
}: {
  availableCouriers: AvailableCourier[];
  order: OperatorOrder;
}) {
  return (
    <article
      className={`grid gap-4 rounded-lg border bg-background p-4 ${
        order.attention.isProblem ? "border-warning/35" : "border-border"
      }`}
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
            <span
              className={`rounded-full border px-3 py-1 text-xs font-medium ${attentionClassName(order.attention.level)}`}
            >
              {attentionLabel(order.attention.level)} · {order.attention.ageLabel}
            </span>
          </div>

          <div className="mt-3 rounded-md border border-border bg-surface-muted px-3 py-2">
            <div className="text-sm font-medium text-foreground">
              {order.attention.title}
            </div>
            <div className="mt-1 text-sm text-foreground/60">
              {order.attention.detail}
            </div>
            <div className="mt-2 text-sm font-medium text-foreground/75">
              Оператору: {order.attention.action}
            </div>
          </div>

          <div className="mt-3 text-sm text-foreground/65">
            {order.restaurant} · {order.customer} · {order.customerPhone}
          </div>
          <div className="mt-1 text-sm text-foreground/65">{order.address}</div>
          <div className="mt-2 text-sm font-medium text-foreground/75">
            {order.dispatchState}
          </div>
          {order.requiresFinancialReview ? (
            <div className="mt-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
              Требуется ручная финансовая сверка: заказ отменен после забора
              курьером, оплата оставлена без автоматического закрытия.
            </div>
          ) : null}
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

      <OrderTimelinePanel
        compact
        className="border-t border-border pt-4"
        timeline={order.timeline}
      />

      <OperatorControls availableCouriers={availableCouriers} order={order} />
    </article>
  );
}

function PilotJournalOrderRow({ order }: { order: PilotJournalOrder }) {
  return (
    <article className="grid gap-3 rounded-lg border border-border bg-background p-4">
      <div className="grid gap-3 lg:grid-cols-[1fr_220px]">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-sm font-semibold">{order.number}</span>
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${statusClassName(order.status)}`}
            >
              {order.statusLabel}
            </span>
            <span className="rounded-full bg-surface-muted px-3 py-1 text-xs font-medium text-foreground/70">
              {order.deliveryStatusLabel}
            </span>
            <span
              className={`rounded-full border px-3 py-1 text-xs font-medium ${pilotJournalAttentionClassName(order)}`}
            >
              {order.attentionLabel}
            </span>
          </div>
          <div className="mt-2 text-sm text-foreground/65">
            {order.restaurant} · {order.customer} · {order.customerPhone}
          </div>
          <div className="mt-1 text-sm text-foreground/55">
            {order.address}
          </div>
          <div className="mt-2 text-sm text-foreground/65">
            Курьер: {order.courier} · {order.cashState} · {order.ageLabel}
          </div>
        </div>
        <div className="grid gap-1 text-sm lg:text-right">
          <div className="text-lg font-semibold">{order.total}</div>
          <div className="text-foreground/55">
            Ресторан: {order.restaurantPayout}
          </div>
          <div className="text-foreground/55">Курьер: {order.courierEarning}</div>
          <div className="text-foreground/55">
            Платформа: {order.platformRevenue}
          </div>
        </div>
      </div>
    </article>
  );
}

export default async function OperatorPage({ searchParams }: OperatorPageProps) {
  await requireAnyRole(["operator", "admin"], {
    redirectPath: "/operator",
  });

  const params = await searchParams;
  const [operatorQueue, availableCouriers, pilotJournal] = await Promise.all([
    getOperatorOrders(),
    getOperatorAvailableCouriers(),
    getOperatorPilotJournal(),
  ]);
  const errorMessage = params.error ? errorMessages[params.error] : null;
  const query = (params.q ?? "").trim().slice(0, 120);
  const scope = resolveOperatorScope(params.scope);
  const queryMatchedQueue = operatorQueue.filter((order) =>
    orderMatchesQuery(order, query),
  );
  const filteredOperatorQueue = queryMatchedQueue.filter((order) =>
    orderMatchesScope(order, scope),
  );
  const hasFilters = query.length > 0 || scope !== "all";
  const waitingRestaurantOrders = queryMatchedQueue.filter(isWaitingRestaurant);
  const withoutCourierOrders = queryMatchedQueue.filter(isWithoutCourier);
  const delayedOrders = queryMatchedQueue.filter(isDelayedOrder);
  const enRouteOrders = queryMatchedQueue.filter(isEnRoute);
  const waitingCourier = queryMatchedQueue.filter(
    (order) => order.latestOffer?.status === "pending",
  ).length;
  const problemOrders = filteredOperatorQueue.filter(
    (order) => order.attention.isProblem,
  );
  const monitoringOrders = filteredOperatorQueue.filter(
    (order) => !order.attention.isProblem,
  );
  const financialReviewOrders = queryMatchedQueue.filter(
    (order) => order.requiresFinancialReview,
  ).length;
  const activeOrders = queryMatchedQueue.filter(isOrderActive).length;
  const assignedDeliveries = queryMatchedQueue.filter((order) =>
    ["assigned", "picked_up", "delivering"].includes(order.deliveryStatus ?? ""),
  ).length;
  const currentPilotOrder =
    pilotJournal.orders.find(isPilotJournalOrderActive) ??
    pilotJournal.orders[0] ??
    null;
  const liveUpdatedAt = new Date();
  const dispatcherScopeCards: Array<{
    count: number;
    detail: string;
    label: string;
    scope: OperatorScope;
    tone?: "default" | "accent" | "warning";
  }> = [
    {
      count: delayedOrders.length,
      detail: "SLA или финансовая логика требуют вмешательства.",
      label: "Опаздывает",
      scope: "delayed",
      tone: delayedOrders.length > 0 ? "warning" : "default",
    },
    {
      count: withoutCourierOrders.length,
      detail: "Нет назначенного курьера или идет автопоиск.",
      label: "Без курьера",
      scope: "no_courier",
      tone: withoutCourierOrders.length > 0 ? "warning" : "default",
    },
    {
      count: waitingRestaurantOrders.length,
      detail: "Ресторан еще не подтвердил заказ.",
      label: "Ждет ресторан",
      scope: "waiting_restaurant",
      tone: waitingRestaurantOrders.length > 0 ? "warning" : "default",
    },
    {
      count: enRouteOrders.length,
      detail: "Курьер забрал заказ или уже едет к клиенту.",
      label: "В пути",
      scope: "en_route",
      tone: enRouteOrders.length > 0 ? "accent" : "default",
    },
  ];
  const dispatcherLanes: Array<{
    detail: string;
    emptyText: string;
    orders: OperatorOrder[];
    scope: OperatorScope;
    title: string;
    tone?: "default" | "warning";
  }> = [
    {
      detail: "Сначала звонок ресторану, затем отмена с причиной при необходимости.",
      emptyText: "Ресторанов, которые держат подтверждение, сейчас нет.",
      orders: waitingRestaurantOrders,
      scope: "waiting_restaurant",
      title: "Ждет ресторан",
      tone: waitingRestaurantOrders.length > 0 ? "warning" : "default",
    },
    {
      detail: "Перезапустить автопоиск или назначить доступного курьера вручную.",
      emptyText: "Все активные заказы сейчас имеют курьера или ожидают штатный шаг.",
      orders: withoutCourierOrders,
      scope: "no_courier",
      title: "Без курьера",
      tone: withoutCourierOrders.length > 0 ? "warning" : "default",
    },
    {
      detail: "Просроченные или рискованные заказы, которые нельзя оставлять автоматики.",
      emptyText: "Просроченных заказов нет.",
      orders: delayedOrders,
      scope: "delayed",
      title: "Опаздывает",
      tone: delayedOrders.length > 0 ? "warning" : "default",
    },
    {
      detail: "Контроль доставки после забора: курьер должен закрыть заказ у клиента.",
      emptyText: "Заказов в пути сейчас нет.",
      orders: enRouteOrders,
      scope: "en_route",
      title: "В пути",
    },
  ];

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

      <RouteAutoRefresh intervalMs={10_000} />

      <section className="rounded-lg border border-border bg-surface p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold">Live-диспетчер</h2>
            <p className="mt-1 text-sm leading-6 text-foreground/60">
              Автообновление каждые 10 секунд. Последняя сверка:{" "}
              {timeFormatter.format(liveUpdatedAt)}. Выберите срез, затем
              обработайте заказ в очереди ниже.
            </p>
          </div>
          <Link
            href="/operator/couriers"
            className="w-fit rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground/75 transition-colors hover:border-accent hover:text-accent"
          >
            Курьеры
          </Link>
          <Link
            href="/operator/pilot"
            className="w-fit rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground/75 transition-colors hover:border-accent hover:text-accent"
          >
            Пилот
          </Link>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-4">
          {dispatcherScopeCards.map((card) => (
            <DispatcherScopeCard
              key={card.scope}
              count={card.count}
              currentScope={scope}
              detail={card.detail}
              label={card.label}
              query={query}
              scope={card.scope}
              tone={card.tone}
            />
          ))}
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-4">
          {dispatcherLanes.map((lane) => (
            <DispatcherLane
              key={lane.scope}
              currentScope={scope}
              detail={lane.detail}
              emptyText={lane.emptyText}
              orders={lane.orders}
              query={query}
              scope={lane.scope}
              title={lane.title}
              tone={lane.tone}
            />
          ))}
        </div>
      </section>

      {currentPilotOrder ? (
        <PilotFocusOrderCard order={currentPilotOrder} />
      ) : null}

      <section className="mt-6 rounded-lg border border-border bg-surface p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Пилотный журнал</h2>
            <p className="mt-1 text-sm leading-6 text-foreground/60">
              Последние 12 заказов для ручного пилота: статус, наличные,
              выплаты ресторану и курьеру.
            </p>
          </div>
          <div className="text-sm text-foreground/55">
            Всего в журнале: {pilotJournal.stats.recentCount}
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <div className="rounded-md border border-border bg-background p-3">
            <div className="text-sm text-foreground/55">Активные</div>
            <div className="mt-1 text-2xl font-semibold">
              {pilotJournal.stats.activeCount}
            </div>
          </div>
          <div className="rounded-md border border-border bg-background p-3">
            <div className="text-sm text-foreground/55">Доставлены</div>
            <div className="mt-1 text-2xl font-semibold">
              {pilotJournal.stats.deliveredCount}
            </div>
          </div>
          <div className="rounded-md border border-border bg-background p-3">
            <div className="text-sm text-foreground/55">Наличные закрыты</div>
            <div className="mt-1 text-2xl font-semibold">
              {pilotJournal.stats.cashCollected}
            </div>
          </div>
          <div className="rounded-md border border-border bg-background p-3">
            <div className="text-sm text-foreground/55">Наличные в работе</div>
            <div className="mt-1 text-2xl font-semibold">
              {pilotJournal.stats.cashInProgress}
            </div>
          </div>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="rounded-md border border-border bg-background p-3 text-sm text-foreground/65">
            Отменены: {pilotJournal.stats.cancelledCount}
          </div>
          <div className="rounded-md border border-border bg-background p-3 text-sm text-foreground/65">
            Выручка платформы по доставленным:{" "}
            <span className="font-semibold text-foreground">
              {pilotJournal.stats.platformRevenue}
            </span>
          </div>
        </div>

        <div className="mt-5 grid gap-3">
          {pilotJournal.orders.length > 0 ? (
            pilotJournal.orders.map((order) => (
              <PilotJournalOrderRow key={order.id} order={order} />
            ))
          ) : (
            <div className="rounded-lg border border-dashed border-border p-6 text-sm text-foreground/60">
              В журнале пока нет заказов.
            </div>
          )}
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-5">
        <InfoTile
          label="Требуют внимания"
          value={String(problemOrders.length)}
          tone={problemOrders.length > 0 ? "warning" : "default"}
        />
        <InfoTile
          label="Фин. сверка"
          value={String(financialReviewOrders)}
          tone={financialReviewOrders > 0 ? "warning" : "default"}
        />
        <InfoTile
          label="Автопоиск работает"
          value={String(waitingCourier)}
          tone={waitingCourier > 0 ? "accent" : "default"}
        />
        <InfoTile label="Активные" value={String(activeOrders)} />
        <InfoTile
          label="Курьеры онлайн"
          value={String(availableCouriers.length)}
          tone={availableCouriers.length > 0 ? "accent" : "warning"}
        />
      </div>

      <Form
        action="/operator"
        className="mt-5 grid gap-3 rounded-lg border border-border bg-surface p-4 lg:grid-cols-[minmax(220px,1fr)_220px_auto_auto]"
      >
        <label className="grid gap-1 text-sm">
          <span className="text-foreground/60">Поиск</span>
          <input
            name="q"
            defaultValue={query}
            maxLength={120}
            placeholder="Номер, телефон, ресторан, адрес"
            className="h-10 rounded-md border border-border bg-background px-3 outline-none focus:border-accent"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-foreground/60">Срез</span>
          <select
            name="scope"
            defaultValue={scope}
            className="h-10 rounded-md border border-border bg-background px-3 outline-none focus:border-accent"
          >
            {operatorScopeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="h-10 self-end rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground"
        >
          Показать
        </button>
        <div className="flex items-end">
          {hasFilters ? (
            <Link
              href="/operator"
              className="flex h-10 items-center rounded-md border border-border px-4 text-sm font-medium text-foreground/75 transition-colors hover:border-accent hover:text-accent"
            >
              Сбросить
            </Link>
          ) : (
            <div className="flex h-10 items-center text-sm text-foreground/55">
              Без фильтров
            </div>
          )}
        </div>
        <div className="text-sm text-foreground/60 lg:col-span-4">
          Показано {filteredOperatorQueue.length} из {operatorQueue.length}.
        </div>
      </Form>

      <section className="mt-6 rounded-lg border border-warning/30 bg-warning/5 p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Центр проблем</h2>
            <p className="mt-1 text-sm text-foreground/60">
              Сюда попадают заказы, где автоматике уже нужна помощь оператора.
              Без курьера: {withoutCourierOrders.length}.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-4">
          {problemOrders.length > 0 ? (
            problemOrders.map((order) => (
              <OperatorOrderCard
                key={order.id}
                availableCouriers={availableCouriers}
                order={order}
              />
            ))
          ) : (
            <div className="rounded-lg border border-dashed border-border p-6 text-sm text-foreground/60">
              Сейчас нет заказов, где требуется вмешательство. Автоматика
              справляется штатно.
            </div>
          )}
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-border bg-surface p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Автоматика и мониторинг</h2>
            <p className="mt-1 text-sm text-foreground/60">
              Активных доставок: {assignedDeliveries}. Эти заказы идут штатно
              или ждут автоматический ответ курьера.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-4">
          {monitoringOrders.length > 0 ? (
            monitoringOrders.map((order) => (
              <OperatorOrderCard
                key={order.id}
                availableCouriers={availableCouriers}
                order={order}
              />
            ))
          ) : (
            <div className="rounded-lg border border-dashed border-border p-6 text-sm text-foreground/60">
              Активных заказов для мониторинга сейчас нет.
            </div>
          )}
        </div>
      </section>
    </SurfaceShell>
  );
}
