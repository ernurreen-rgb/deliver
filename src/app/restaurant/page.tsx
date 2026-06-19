import Link from "next/link";
import { InfoTile } from "@/components/shared/info-tile";
import { SurfaceShell } from "@/components/layout/surface-shell";
import { OrderTimelinePanel } from "@/components/orders/order-timeline";
import { PendingSubmitButton } from "@/components/shared/pending-submit-button";
import { RouteAutoRefresh } from "@/components/shared/route-auto-refresh";
import { requireAnyRole } from "@/domains/auth/authorization";
import { getRestaurantStaffContextForUser } from "@/domains/auth/restaurant-staff-context";
import {
  acceptRestaurantOrderAction,
  markOrderReadyForPickupAction,
  rejectRestaurantOrderAction,
  startPreparingOrderAction,
} from "@/domains/orders/restaurant-actions";
import { getRestaurantDashboard } from "@/domains/orders/queries";

export const dynamic = "force-dynamic";

type RestaurantDashboardPageProps = {
  searchParams: Promise<{
    error?: string;
    updated?: string;
  }>;
};

type RestaurantDashboard = NonNullable<
  Awaited<ReturnType<typeof getRestaurantDashboard>>
>;
type RestaurantOrder = RestaurantDashboard["orders"][number];
type RestaurantLane = {
  key: string;
  title: string;
  description: string;
  orders: RestaurantOrder[];
  emptyText: string;
};

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
  input_too_long: "Комментарий слишком длинный.",
  forbidden: "У вас нет доступа к этому ресторану.",
  invalid_status: "Статус заказа уже изменился. Обновите страницу.",
  order_not_found: "Заказ не найден.",
  order_required: "Не передан заказ для изменения.",
  reason_required: "Укажите причину отказа или отмены.",
  restaurant_staff_required: "Аккаунт не привязан к ресторану.",
};

function statusClassName(status: string) {
  if (status === "pending_confirmation") {
    return "bg-warning/10 text-warning";
  }

  if (status === "ready_for_pickup") {
    return "bg-accent/10 text-accent";
  }

  return "bg-surface-muted text-foreground/70";
}

function actionToneClassName(tone: RestaurantOrder["restaurantActionTone"]) {
  if (tone === "warning") {
    return "border-warning/35 bg-warning/10 text-warning";
  }

  if (tone === "accent") {
    return "border-accent/30 bg-accent/10 text-accent";
  }

  return "border-border bg-surface-muted text-foreground/70";
}

function orderBelongsToLane(order: RestaurantOrder, laneKey: string) {
  if (laneKey === "new") {
    return order.status === "pending_confirmation";
  }

  if (laneKey === "start") {
    return order.status === "accepted" || order.status === "courier_assigned";
  }

  if (laneKey === "preparing") {
    return order.status === "preparing";
  }

  if (laneKey === "pickup") {
    return order.status === "ready_for_pickup";
  }

  return false;
}

function OrderActions({ order }: { order: { id: string; status: string } }) {
  if (order.status === "pending_confirmation") {
    return (
      <div className="grid gap-3 border-t border-border pt-4">
        <form
          action={acceptRestaurantOrderAction}
          className="grid gap-3 rounded-md border border-border bg-background p-3"
        >
          <input name="orderId" type="hidden" value={order.id} />
          <label className="grid gap-1 text-sm">
            <span className="text-foreground/60">Минуты</span>
            <input
              name="preparationMinutes"
              type="number"
              min={5}
              max={180}
              defaultValue={30}
              className="h-10 rounded-md border border-border bg-surface px-3 outline-none focus:border-accent"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-foreground/60">Комментарий кухни</span>
            <input
              name="restaurantComment"
              maxLength={500}
              placeholder="Например: будет готово к выдаче быстро"
              className="h-10 rounded-md border border-border bg-surface px-3 outline-none focus:border-accent"
            />
          </label>
          <PendingSubmitButton
            pendingText="Принимаем"
            className="h-10 justify-self-start rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground"
          >
            Принять
          </PendingSubmitButton>
        </form>

        <form action={rejectRestaurantOrderAction} className="grid gap-3">
          <input name="orderId" type="hidden" value={order.id} />
          <input
            name="restaurantComment"
            maxLength={500}
            placeholder="Причина отказа"
            required
            className="h-10 rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-warning"
          />
          <PendingSubmitButton
            pendingText="Отклоняем"
            className="h-10 justify-self-start rounded-md border border-warning/35 px-4 text-sm font-medium text-warning transition-colors hover:bg-warning/10"
          >
            Отклонить
          </PendingSubmitButton>
        </form>
      </div>
    );
  }

  if (order.status === "accepted" || order.status === "courier_assigned") {
    return (
      <div className="grid gap-3 border-t border-border pt-4">
        <form action={startPreparingOrderAction}>
          <input name="orderId" type="hidden" value={order.id} />
          <PendingSubmitButton
            pendingText="Обновляем"
            className="h-10 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground"
          >
            Начать готовить
          </PendingSubmitButton>
        </form>
        <form action={rejectRestaurantOrderAction} className="grid gap-3">
          <input name="orderId" type="hidden" value={order.id} />
          <input
            name="restaurantComment"
            maxLength={500}
            placeholder="Причина отмены"
            required
            className="h-10 rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-warning"
          />
          <PendingSubmitButton
            pendingText="Отменяем"
            className="h-10 justify-self-start rounded-md border border-warning/35 px-4 text-sm font-medium text-warning transition-colors hover:bg-warning/10"
          >
            Отменить
          </PendingSubmitButton>
        </form>
      </div>
    );
  }

  if (order.status === "preparing") {
    return (
      <form action={markOrderReadyForPickupAction} className="border-t border-border pt-4">
        <input name="orderId" type="hidden" value={order.id} />
        <PendingSubmitButton
          pendingText="Обновляем"
          className="h-10 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground"
        >
          Готов к выдаче
        </PendingSubmitButton>
      </form>
    );
  }

  return (
    <div className="border-t border-border pt-4 text-sm text-foreground/60">
      Заказ готов. Дальше оператор или автоназначение курьера заберет его в доставку.
    </div>
  );
}

function RestaurantOrderCard({ order }: { order: RestaurantOrder }) {
  return (
    <article className="grid gap-4 rounded-lg border border-border bg-background p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-semibold">{order.number}</span>
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${statusClassName(order.status)}`}
            >
              {order.statusLabel}
            </span>
            <span
              className={`rounded-full border px-3 py-1 text-xs font-medium ${actionToneClassName(order.restaurantActionTone)}`}
            >
              {order.restaurantActionLabel}
            </span>
          </div>
          <div className="mt-2 text-sm text-foreground/60">
            {dateFormatter.format(order.createdAt)} · {order.customerName} ·{" "}
            {order.customerPhone}
          </div>
          <div className="mt-1 text-sm text-foreground/60">{order.addressLine}</div>
          <div className="mt-1 text-sm font-medium text-foreground/70">
            {order.dispatchLabel}
          </div>
          <div className="mt-1 text-xs text-foreground/50">
            В текущем статусе: {order.statusAgeLabel}
          </div>
        </div>
        <div className="text-left sm:text-right">
          <div className="text-lg font-semibold">{order.customerTotal}</div>
          <div className="mt-1 text-sm text-foreground/55">
            {order.itemsCount} поз.
          </div>
        </div>
      </div>

      <div className="grid gap-2 rounded-md border border-border bg-surface p-3">
        {order.items.map((item) => (
          <div key={item.id} className="flex items-start justify-between gap-4 text-sm">
            <span>
              {item.name} · {item.quantity} × {item.unitPrice}
            </span>
            <span className="font-medium">{item.totalPrice}</span>
          </div>
        ))}
      </div>

      <div className="grid gap-2 text-sm text-foreground/65 md:grid-cols-3">
        <div>Блюда: {order.itemsSubtotal}</div>
        <div>Доставка: {order.deliveryFee}</div>
        <div>Сервисный сбор: {order.serviceFee}</div>
      </div>

      {order.customerComment ? (
        <div className="rounded-md border border-border bg-surface p-3 text-sm text-foreground/70">
          Комментарий клиента: {order.customerComment}
        </div>
      ) : null}
      {order.restaurantComment ? (
        <div className="rounded-md border border-border bg-surface p-3 text-sm text-foreground/70">
          Комментарий ресторана: {order.restaurantComment}
        </div>
      ) : null}

      <OrderTimelinePanel
        compact
        className="border-t border-border pt-4"
        timeline={order.timeline}
      />

      <OrderActions order={order} />
    </article>
  );
}

function RestaurantLaneSection({ lane }: { lane: RestaurantLane }) {
  return (
    <section className="grid content-start gap-3">
      <div className="border-b border-border pb-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold">{lane.title}</h3>
          <span className="rounded-full bg-surface-muted px-2.5 py-1 text-xs font-medium text-foreground/70">
            {lane.orders.length}
          </span>
        </div>
        <p className="mt-1 text-sm leading-5 text-foreground/60">
          {lane.description}
        </p>
      </div>

      {lane.orders.length > 0 ? (
        lane.orders.map((order) => <RestaurantOrderCard key={order.id} order={order} />)
      ) : (
        <div className="rounded-lg border border-dashed border-border p-4 text-sm text-foreground/60">
          {lane.emptyText}
        </div>
      )}
    </section>
  );
}

export default async function RestaurantDashboardPage({
  searchParams,
}: RestaurantDashboardPageProps) {
  const user = await requireAnyRole(["restaurant_staff", "admin"], {
    redirectPath: "/restaurant",
  });
  const params = await searchParams;
  const staff = await getRestaurantStaffContextForUser(user);
  const errorMessage = params.error ? errorMessages[params.error] : null;

  const dashboard = staff ? await getRestaurantDashboard(staff) : null;

  if (!dashboard) {
    return (
      <SurfaceShell
        title="Кабинет ресторана"
        description="Этот аккаунт пока не привязан к ресторану."
      >
        <div className="rounded-lg border border-warning/30 bg-warning/10 p-5 text-sm text-warning">
          Попросите администратора добавить пользователя в staff ресторана.
        </div>
      </SurfaceShell>
    );
  }

  const renderedAt = new Date();
  const orderedActiveOrders = [...dashboard.orders].sort(
    (left, right) =>
      left.restaurantActionSortWeight - right.restaurantActionSortWeight ||
      left.currentStatusStartedAt.getTime() - right.currentStatusStartedAt.getTime(),
  );
  const nextOperationalOrder =
    orderedActiveOrders.find((order) => order.status !== "ready_for_pickup") ??
    orderedActiveOrders[0] ??
    null;
  const lanes: RestaurantLane[] = [
    {
      key: "new",
      title: "Новые",
      description: "Заказы, которые ресторан еще не подтвердил.",
      orders: orderedActiveOrders.filter((order) => orderBelongsToLane(order, "new")),
      emptyText: "Нет новых заказов.",
    },
    {
      key: "start",
      title: "В работу",
      description: "Принятые заказы, по которым кухня еще не стартовала.",
      orders: orderedActiveOrders.filter((order) => orderBelongsToLane(order, "start")),
      emptyText: "Нет заказов на старт приготовления.",
    },
    {
      key: "preparing",
      title: "Готовятся",
      description: "Заказы на кухне, которые нужно довести до выдачи.",
      orders: orderedActiveOrders.filter((order) =>
        orderBelongsToLane(order, "preparing"),
      ),
      emptyText: "Кухня пока без активного приготовления.",
    },
    {
      key: "pickup",
      title: "Выдача",
      description: "Готовые заказы, ожидающие курьера.",
      orders: orderedActiveOrders.filter((order) =>
        orderBelongsToLane(order, "pickup"),
      ),
      emptyText: "Нет заказов на выдачу.",
    },
  ];

  return (
    <SurfaceShell
      title="Кабинет ресторана"
      description={`${dashboard.restaurant.name} · ${dashboard.restaurant.addressLine}`}
    >
      <RouteAutoRefresh intervalMs={10_000} />

      {params.updated ? (
        <div className="mb-5 rounded-lg border border-accent/30 bg-accent/10 p-4 text-sm text-accent">
          Заказ {params.updated} обновлен.
        </div>
      ) : null}
      {errorMessage ? (
        <div className="mb-5 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
          {errorMessage}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-5">
        <InfoTile
          label="Новые"
          value={String(dashboard.stats.newOrders)}
          tone="accent"
        />
        <InfoTile label="Приняты" value={String(dashboard.stats.accepted)} />
        <InfoTile label="Готовятся" value={String(dashboard.stats.preparing)} />
        <InfoTile
          label="Готовы"
          value={String(dashboard.stats.readyForPickup)}
        />
        <InfoTile
          label="Стоп-лист"
          value={String(dashboard.stats.menuUnavailable)}
          tone={dashboard.stats.menuUnavailable > 0 ? "warning" : "default"}
        />
      </div>

      <section className="mt-6 grid gap-4 rounded-lg border border-border bg-surface p-5 md:grid-cols-[1.2fr_0.8fr]">
        <div>
          <div className="text-sm text-foreground/55">Следующий операционный шаг</div>
          {nextOperationalOrder ? (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <span className="text-xl font-semibold">
                {nextOperationalOrder.number}
              </span>
              <span
                className={`rounded-full border px-3 py-1 text-xs font-medium ${actionToneClassName(nextOperationalOrder.restaurantActionTone)}`}
              >
                {nextOperationalOrder.restaurantActionLabel}
              </span>
              <span className="text-sm text-foreground/60">
                {nextOperationalOrder.statusAgeLabel} в статусе
              </span>
            </div>
          ) : (
            <div className="mt-2 text-xl font-semibold">Активных заказов нет</div>
          )}
        </div>
        <div className="grid gap-1 text-sm text-foreground/60 md:text-right">
          <div>Роль: {dashboard.restaurant.role}</div>
          <div>Баланс: {dashboard.restaurant.balance}</div>
          <div>Обновлено: {timeFormatter.format(renderedAt)}</div>
        </div>
      </section>

      <section className="mt-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Рабочая доска</h2>
            <p className="mt-1 text-sm text-foreground/60">
              Активные заказы разделены по этапам кухни и выдачи.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/restaurant/menu"
              className="rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground/75 transition-colors hover:border-accent hover:text-accent"
            >
              Меню
            </Link>
            <Link
              href="/restaurant/settings"
              className="rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground/75 transition-colors hover:border-accent hover:text-accent"
            >
              Настройки
            </Link>
          </div>
        </div>

        <div className="mt-5 grid gap-6 lg:grid-cols-2 xl:grid-cols-4">
          {orderedActiveOrders.length > 0 ? (
            lanes.map((lane) => <RestaurantLaneSection key={lane.key} lane={lane} />)
          ) : (
            <div className="rounded-lg border border-dashed border-border p-6 text-sm text-foreground/60">
              Активных заказов пока нет.
            </div>
          )}
        </div>
      </section>
    </SurfaceShell>
  );
}
