import Link from "next/link";
import { InfoTile } from "@/components/shared/info-tile";
import { SurfaceShell } from "@/components/layout/surface-shell";
import { getCurrentUser } from "@/domains/auth/session";
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

const dateFormatter = new Intl.DateTimeFormat("ru-KZ", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const errorMessages: Record<string, string> = {
  input_too_long: "Комментарий слишком длинный.",
  forbidden: "У вас нет доступа к этому ресторану.",
  invalid_status: "Статус заказа уже изменился. Обновите страницу.",
  order_not_found: "Заказ не найден.",
  order_required: "Не передан заказ для изменения.",
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

function OrderActions({ order }: { order: { id: string; status: string } }) {
  if (order.status === "pending_confirmation") {
    return (
      <div className="grid gap-3 border-t border-border pt-4">
        <form
          action={acceptRestaurantOrderAction}
          className="grid gap-3 rounded-md border border-border bg-background p-3 sm:grid-cols-[150px_1fr_auto]"
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
          <button
            type="submit"
            className="h-10 self-end rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground"
          >
            Принять
          </button>
        </form>

        <form action={rejectRestaurantOrderAction} className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <input name="orderId" type="hidden" value={order.id} />
          <input
            name="restaurantComment"
            maxLength={500}
            placeholder="Причина отказа"
            className="h-10 rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-warning"
          />
          <button
            type="submit"
            className="h-10 rounded-md border border-warning/35 px-4 text-sm font-medium text-warning transition-colors hover:bg-warning/10"
          >
            Отклонить
          </button>
        </form>
      </div>
    );
  }

  if (order.status === "accepted" || order.status === "courier_assigned") {
    return (
      <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-[auto_1fr_auto]">
        <form action={startPreparingOrderAction}>
          <input name="orderId" type="hidden" value={order.id} />
          <button
            type="submit"
            className="h-10 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground"
          >
            Начать готовить
          </button>
        </form>
        <form action={rejectRestaurantOrderAction} className="contents">
          <input name="orderId" type="hidden" value={order.id} />
          <input
            name="restaurantComment"
            maxLength={500}
            placeholder="Причина отмены"
            className="h-10 rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-warning"
          />
          <button
            type="submit"
            className="h-10 rounded-md border border-warning/35 px-4 text-sm font-medium text-warning transition-colors hover:bg-warning/10"
          >
            Отменить
          </button>
        </form>
      </div>
    );
  }

  if (order.status === "preparing") {
    return (
      <form action={markOrderReadyForPickupAction} className="border-t border-border pt-4">
        <input name="orderId" type="hidden" value={order.id} />
        <button
          type="submit"
          className="h-10 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground"
        >
          Готов к выдаче
        </button>
      </form>
    );
  }

  return (
    <div className="border-t border-border pt-4 text-sm text-foreground/60">
      Заказ готов. Дальше оператор или автоназначение курьера заберет его в доставку.
    </div>
  );
}

export default async function RestaurantDashboardPage({
  searchParams,
}: RestaurantDashboardPageProps) {
  const user = await getCurrentUser();
  const params = await searchParams;

  if (!user) {
    return (
      <SurfaceShell
        title="Кабинет ресторана"
        description="Войдите как сотрудник ресторана, чтобы подтверждать заказы и вести приготовление."
      >
        <Link
          href="/login"
          className="inline-flex rounded-md bg-accent px-4 py-3 text-sm font-medium text-accent-foreground"
        >
          Войти по телефону
        </Link>
      </SurfaceShell>
    );
  }

  const dashboard = await getRestaurantDashboard(user.id);
  const errorMessage = params.error ? errorMessages[params.error] : null;

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

  return (
    <SurfaceShell
      title="Кабинет ресторана"
      description={`${dashboard.restaurant.name} · ${dashboard.restaurant.addressLine}`}
    >
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

      <section className="mt-6 rounded-lg border border-border bg-surface p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Активные заказы</h2>
            <p className="mt-1 text-sm text-foreground/60">
              Ресторан подтверждает заказ, ведет приготовление и отмечает готовность к выдаче.
            </p>
          </div>
          <div className="rounded-md border border-border px-3 py-2 text-sm text-foreground/65">
            Роль: {dashboard.restaurant.role}
          </div>
        </div>

        <div className="mt-5 grid gap-4">
          {dashboard.orders.length > 0 ? (
            dashboard.orders.map((order) => (
              <article
                key={order.id}
                className="grid gap-4 rounded-lg border border-border bg-background p-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="font-semibold">{order.number}</span>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-medium ${statusClassName(order.status)}`}
                      >
                        {order.statusLabel}
                      </span>
                    </div>
                    <div className="mt-2 text-sm text-foreground/60">
                      {dateFormatter.format(order.createdAt)} · {order.customerName} ·{" "}
                      {order.customerPhone}
                    </div>
                    <div className="mt-1 text-sm text-foreground/60">
                      {order.addressLine}
                    </div>
                    <div className="mt-1 text-sm font-medium text-foreground/70">
                      {order.dispatchLabel}
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
                    <div
                      key={item.id}
                      className="flex items-start justify-between gap-4 text-sm"
                    >
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

                <OrderActions order={order} />
              </article>
            ))
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
