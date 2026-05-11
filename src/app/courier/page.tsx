import Link from "next/link";
import { SurfaceShell } from "@/components/layout/surface-shell";
import { InfoTile } from "@/components/shared/info-tile";
import { getCurrentUser } from "@/domains/auth/session";
import {
  acceptCourierOfferAction,
  completeDeliveryAction,
  goOfflineCourierAction,
  goOnlineCourierAction,
  markDeliveryPickedUpAction,
  rejectCourierOfferAction,
  startDeliveryAction,
} from "@/domains/delivery/courier-actions";
import { getCourierDashboard } from "@/domains/orders/queries";

export const dynamic = "force-dynamic";

type CourierPageProps = {
  searchParams: Promise<{
    error?: string;
    updated?: string;
  }>;
};

type DeliveryActionProps = {
  delivery: {
    id: string;
    status: string;
    orderStatus: string;
  };
};

const dateFormatter = new Intl.DateTimeFormat("ru-KZ", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const errorMessages: Record<string, string> = {
  courier_not_found: "Этот аккаунт пока не привязан к профилю курьера.",
  delivery_not_found: "Доставка не найдена или уже не принадлежит вам.",
  delivery_required: "Не передана доставка для действия.",
  active_delivery_exists: "Нельзя уйти с линии, пока есть активная доставка.",
  courier_location_required: "Нужна геопозиция курьера, чтобы выйти на линию.",
  courier_unavailable: "Курьер уже занят или недоступен. Предложение передано следующему курьеру.",
  invalid_delivery_status: "Статус доставки уже изменился. Обновите страницу.",
  invalid_courier_status: "Текущий статус курьера не позволяет выполнить действие.",
  offer_expired: "Предложение истекло. Мы попробовали назначить следующего курьера.",
  offer_not_found: "Предложение не найдено.",
  offer_required: "Не передано предложение для действия.",
  offer_unavailable: "Предложение уже недоступно.",
};

function AvailabilityControl({
  courier,
}: {
  courier: {
    status: string;
    availabilityStatus: string;
    hasLocation: boolean;
  };
}) {
  if (courier.status === "inactive") {
    return (
      <form action={goOnlineCourierAction} className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          type="submit"
          disabled={!courier.hasLocation}
          className="h-10 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          Выйти на линию
        </button>
        {!courier.hasLocation ? (
          <span className="text-sm text-warning">
            Нужна геопозиция курьера.
          </span>
        ) : null}
      </form>
    );
  }

  if (courier.status === "available") {
    return (
      <form action={goOfflineCourierAction}>
        <button
          type="submit"
          className="h-10 rounded-md border border-border px-4 text-sm font-medium text-foreground/75 transition-colors hover:border-warning hover:text-warning"
        >
          Уйти с линии
        </button>
      </form>
    );
  }

  if (courier.status === "busy") {
    return (
      <div className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground/65">
        Вы на заказе. Уйти с линии можно после завершения доставки.
      </div>
    );
  }

  return (
    <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
      Статус курьера не позволяет менять доступность.
    </div>
  );
}

function DeliveryAction({ delivery }: DeliveryActionProps) {
  if (delivery.status === "assigned" && delivery.orderStatus === "ready_for_pickup") {
    return (
      <form action={markDeliveryPickedUpAction}>
        <input name="deliveryId" type="hidden" value={delivery.id} />
        <button
          type="submit"
          className="h-10 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground"
        >
          Забрал заказ
        </button>
      </form>
    );
  }

  if (delivery.status === "assigned") {
    return (
      <div className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground/65">
        Ждем готовность ресторана
      </div>
    );
  }

  if (delivery.status === "picked_up" && delivery.orderStatus === "picked_up") {
    return (
      <form action={startDeliveryAction}>
        <input name="deliveryId" type="hidden" value={delivery.id} />
        <button
          type="submit"
          className="h-10 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground"
        >
          Начать доставку
        </button>
      </form>
    );
  }

  if (delivery.status === "delivering" && delivery.orderStatus === "delivering") {
    return (
      <form action={completeDeliveryAction}>
        <input name="deliveryId" type="hidden" value={delivery.id} />
        <button
          type="submit"
          className="h-10 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground"
        >
          Доставил
        </button>
      </form>
    );
  }

  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground/65">
      Действий нет
    </div>
  );
}

export default async function CourierPage({ searchParams }: CourierPageProps) {
  const user = await getCurrentUser();
  const params = await searchParams;

  if (!user) {
    return (
      <SurfaceShell
        title="Кабинет курьера"
        description="Войдите как курьер, чтобы видеть предложения заказов и активные доставки."
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

  const dashboard = await getCourierDashboard(user.id);
  const errorMessage = params.error ? errorMessages[params.error] : null;

  if (!dashboard) {
    return (
      <SurfaceShell
        title="Кабинет курьера"
        description="Профиль курьера еще не создан для этого аккаунта."
      >
        <div className="rounded-lg border border-warning/30 bg-warning/10 p-5 text-sm text-warning">
          Попросите администратора создать профиль курьера и привязать его к вашему номеру.
        </div>
      </SurfaceShell>
    );
  }

  return (
    <SurfaceShell
      title="Кабинет курьера"
      description={`${dashboard.courier.fullName} · ${dashboard.courier.availabilityStatus}`}
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

      <div className="grid gap-4 md:grid-cols-3">
        <InfoTile label="Статус" value={dashboard.courier.status} tone="warning" />
        <InfoTile
          label="Предложения"
          value={String(dashboard.stats.pendingOffers)}
          tone={dashboard.stats.pendingOffers > 0 ? "accent" : "default"}
        />
        <InfoTile label="Баланс" value={dashboard.stats.balance} />
      </div>

      <section className="mt-6 rounded-lg border border-border bg-surface p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Линия</h2>
            <div className="mt-1 text-sm text-foreground/60">
              Доступность: {dashboard.courier.availabilityStatus}
            </div>
          </div>
          <AvailabilityControl courier={dashboard.courier} />
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-border bg-surface p-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">Новые предложения</h2>
          <p className="text-sm text-foreground/60">
            Заказ закрепится за вами только после принятия.
          </p>
        </div>

        <div className="mt-5 grid gap-4">
          {dashboard.offers.length > 0 ? (
            dashboard.offers.map((offer) => (
              <article
                key={offer.id}
                className="grid gap-4 rounded-lg border border-accent/30 bg-background p-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="font-semibold">{offer.orderNumber}</span>
                      <span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
                        до {dateFormatter.format(offer.expiresAt)}
                      </span>
                    </div>
                    <div className="mt-2 text-sm text-foreground/65">
                      {offer.restaurant} · {offer.restaurantAddress}
                    </div>
                    <div className="mt-1 text-sm text-foreground/65">
                      {offer.deliveryAddress}
                    </div>
                  </div>
                  <div className="text-left sm:text-right">
                    <div className="text-lg font-semibold">{offer.customerTotal}</div>
                    <div className="mt-1 text-sm text-foreground/55">
                      Доставка: {offer.deliveryFee}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row">
                  <form action={acceptCourierOfferAction}>
                    <input name="offerId" type="hidden" value={offer.id} />
                    <button
                      type="submit"
                      className="h-10 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground"
                    >
                      Принять
                    </button>
                  </form>
                  <form action={rejectCourierOfferAction}>
                    <input name="offerId" type="hidden" value={offer.id} />
                    <button
                      type="submit"
                      className="h-10 rounded-md border border-warning/35 px-4 text-sm font-medium text-warning transition-colors hover:bg-warning/10"
                    >
                      Отказаться
                    </button>
                  </form>
                </div>
              </article>
            ))
          ) : (
            <div className="rounded-lg border border-dashed border-border p-6 text-sm text-foreground/60">
              Сейчас нет новых предложений.
            </div>
          )}
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-border bg-surface p-5">
        <h2 className="text-lg font-semibold">Активные доставки</h2>
        <div className="mt-5 grid gap-4">
          {dashboard.assignedDeliveries.length > 0 ? (
            dashboard.assignedDeliveries.map((delivery) => (
              <article
                key={delivery.id}
                className="grid gap-4 rounded-lg border border-border bg-background p-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="font-semibold">{delivery.orderNumber}</span>
                      <span className="rounded-full bg-surface-muted px-3 py-1 text-xs font-medium text-foreground/70">
                        {delivery.statusLabel}
                      </span>
                    </div>
                    <div className="mt-2 text-sm text-foreground/65">
                      {delivery.restaurant} · {delivery.restaurantAddress}
                    </div>
                    <div className="mt-1 text-sm text-foreground/65">
                      {delivery.deliveryAddress}
                    </div>
                    <div className="mt-2 text-sm font-medium text-foreground/70">
                      Заказ: {delivery.orderStatusLabel}
                    </div>
                  </div>
                  <div className="text-left sm:text-right">
                    <div className="text-lg font-semibold">{delivery.customerTotal}</div>
                    <div className="mt-1 text-sm text-foreground/55">
                      {delivery.itemsCount} поз.
                    </div>
                  </div>
                </div>

                <div className="flex border-t border-border pt-4">
                  <DeliveryAction delivery={delivery} />
                </div>
              </article>
            ))
          ) : (
            <div className="rounded-lg border border-dashed border-border p-6 text-sm text-foreground/60">
              Активных доставок пока нет.
            </div>
          )}
        </div>
      </section>
    </SurfaceShell>
  );
}
