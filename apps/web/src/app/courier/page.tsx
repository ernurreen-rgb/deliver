import { SurfaceShell } from "@/components/layout/surface-shell";
import { InfoTile } from "@/components/shared/info-tile";
import { PendingSubmitButton } from "@/components/shared/pending-submit-button";
import { RouteAutoRefresh } from "@/components/shared/route-auto-refresh";
import { requireAnyRole } from "@/domains/auth/authorization";
import {
  acceptCourierOfferAction,
  completeDeliveryAction,
  goOfflineCourierAction,
  goOnlineCourierAction,
  markDeliveryPickedUpAction,
  releaseAssignedDeliveryAction,
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

type CourierDashboard = NonNullable<Awaited<ReturnType<typeof getCourierDashboard>>>;
type CourierOffer = CourierDashboard["offers"][number];
type AssignedDelivery = CourierDashboard["assignedDeliveries"][number];

const timeFormatter = new Intl.DateTimeFormat("ru-KZ", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
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
  input_too_long: "Текст слишком длинный.",
  cash_confirmation_required: "Подтвердите, что наличные получены.",
  financial_record_missing: "Не хватает финансовых данных заказа. Передайте заказ оператору.",
  payment_amount_mismatch: "Сумма оплаты не совпадает с итогом заказа. Передайте заказ оператору.",
  payment_record_missing: "Не найдена активная оплата заказа. Передайте заказ оператору.",
  reason_required: "Укажите причину отказа от доставки.",
  offer_expired: "Предложение истекло. Мы попробовали назначить следующего курьера.",
  offer_not_found: "Предложение не найдено.",
  offer_required: "Не передано предложение для действия.",
  offer_unavailable: "Предложение уже недоступно.",
  unsupported_payment_method: "Этот способ оплаты пока не закрывается курьерским действием.",
};

function actionToneClassName(tone: AssignedDelivery["actionTone"] | "accent") {
  if (tone === "warning") {
    return "border-warning/35 bg-warning/10 text-warning";
  }

  if (tone === "accent") {
    return "border-accent/30 bg-accent/10 text-accent";
  }

  return "border-border bg-surface-muted text-foreground/70";
}

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
        <PendingSubmitButton
          disabled={!courier.hasLocation}
          pendingText="Выходим"
          className="h-10 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground"
        >
          Выйти на линию
        </PendingSubmitButton>
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
        <PendingSubmitButton
          pendingText="Обновляем"
          className="h-10 rounded-md border border-border px-4 text-sm font-medium text-foreground/75 transition-colors hover:border-warning hover:text-warning"
        >
          Уйти с линии
        </PendingSubmitButton>
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

function ReleaseAssignedDeliveryForm({ deliveryId }: { deliveryId: string }) {
  return (
    <form
      action={releaseAssignedDeliveryAction}
      className="grid gap-3 sm:grid-cols-[1fr_auto]"
    >
      <input name="deliveryId" type="hidden" value={deliveryId} />
      <input
        name="reason"
        maxLength={240}
        placeholder="Причина отказа"
        required
        className="h-10 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-warning"
      />
      <PendingSubmitButton
        pendingText="Передаем"
        className="h-10 rounded-md border border-warning/35 px-4 text-sm font-medium text-warning transition-colors hover:bg-warning/10"
      >
        Не могу выполнить
      </PendingSubmitButton>
    </form>
  );
}

function DeliveryAction({ delivery }: DeliveryActionProps) {
  if (delivery.status === "assigned" && delivery.orderStatus === "ready_for_pickup") {
    return (
      <div className="grid w-full gap-3 lg:grid-cols-[auto_1fr]">
        <form action={markDeliveryPickedUpAction}>
          <input name="deliveryId" type="hidden" value={delivery.id} />
          <PendingSubmitButton
            pendingText="Обновляем"
            className="h-10 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground"
          >
            Забрал заказ
          </PendingSubmitButton>
        </form>
        <ReleaseAssignedDeliveryForm deliveryId={delivery.id} />
      </div>
    );
  }

  if (delivery.status === "assigned") {
    return (
      <div className="grid w-full gap-3 lg:grid-cols-[auto_1fr]">
        <div className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground/65">
          Ждем готовность ресторана
        </div>
        <ReleaseAssignedDeliveryForm deliveryId={delivery.id} />
      </div>
    );
  }

  if (delivery.status === "picked_up" && delivery.orderStatus === "picked_up") {
    return (
      <form action={startDeliveryAction}>
        <input name="deliveryId" type="hidden" value={delivery.id} />
        <PendingSubmitButton
          pendingText="Обновляем"
          className="h-10 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground"
        >
          Начать доставку
        </PendingSubmitButton>
      </form>
    );
  }

  if (delivery.status === "delivering" && delivery.orderStatus === "delivering") {
    return (
      <form action={completeDeliveryAction} className="grid gap-3">
        <input name="deliveryId" type="hidden" value={delivery.id} />
        <label className="flex gap-3 rounded-md border border-border bg-surface p-3 text-sm text-foreground/70">
          <input
            name="cashCollectedConfirmed"
            type="checkbox"
            required
            className="mt-1 h-4 w-4 accent-[var(--accent)]"
          />
          <span>
            <span className="block font-medium text-foreground">
              Наличные получены
            </span>
            <span className="mt-1 block text-foreground/60">
              После подтверждения заказ закроется как оплаченный.
            </span>
          </span>
        </label>
        <PendingSubmitButton
          pendingText="Закрываем"
          className="h-10 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground"
        >
          Доставил
        </PendingSubmitButton>
      </form>
    );
  }

  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground/65">
      Действий нет
    </div>
  );
}

function CourierOfferCard({ offer }: { offer: CourierOffer }) {
  return (
    <article className="grid gap-4 rounded-lg border border-accent/30 bg-background p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-semibold">{offer.orderNumber}</span>
            <span className="rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
              ответить за {offer.expiresInLabel}
            </span>
          </div>
          <div className="mt-2 text-sm text-foreground/65">
            Забрать: {offer.restaurant} · {offer.restaurantAddress}
          </div>
          <div className="mt-1 text-sm text-foreground/65">
            Доставить: {offer.deliveryAddress}
          </div>
          <div className="mt-1 text-sm text-foreground/60">
            Клиент: {offer.customerName} · {offer.customerPhone}
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
          <PendingSubmitButton
            pendingText="Принимаем"
            className="h-10 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground"
          >
            Принять
          </PendingSubmitButton>
        </form>
        <form action={rejectCourierOfferAction}>
          <input name="offerId" type="hidden" value={offer.id} />
          <PendingSubmitButton
            pendingText="Отказываемся"
            className="h-10 rounded-md border border-warning/35 px-4 text-sm font-medium text-warning transition-colors hover:bg-warning/10"
          >
            Отказаться
          </PendingSubmitButton>
        </form>
      </div>
    </article>
  );
}

function AssignedDeliveryCard({ delivery }: { delivery: AssignedDelivery }) {
  return (
    <article className="grid gap-4 rounded-lg border border-border bg-background p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-semibold">{delivery.orderNumber}</span>
            <span className="rounded-full bg-surface-muted px-3 py-1 text-xs font-medium text-foreground/70">
              {delivery.statusLabel}
            </span>
            <span
              className={`rounded-full border px-3 py-1 text-xs font-medium ${actionToneClassName(delivery.actionTone)}`}
            >
              {delivery.actionLabel}
            </span>
          </div>
          <div className="mt-2 text-sm font-medium text-foreground/70">
            Заказ: {delivery.orderStatusLabel}
          </div>
          <div className="mt-1 text-xs text-foreground/50">
            В текущем шаге: {delivery.currentActionAgeLabel}
          </div>
        </div>
        <div className="text-left sm:text-right">
          <div className="text-lg font-semibold">{delivery.customerTotal}</div>
          <div className="mt-1 text-sm text-foreground/55">
            {delivery.itemsCount} поз.
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-md border border-border bg-surface p-3">
          <div className="text-xs font-medium uppercase text-foreground/45">
            Забрать
          </div>
          <div className="mt-2 text-sm font-medium">{delivery.restaurant}</div>
          <div className="mt-1 text-sm leading-5 text-foreground/65">
            {delivery.restaurantAddress}
          </div>
        </div>
        <div className="rounded-md border border-border bg-surface p-3">
          <div className="text-xs font-medium uppercase text-foreground/45">
            Доставить
          </div>
          <div className="mt-2 text-sm font-medium">
            {delivery.customerName} · {delivery.customerPhone}
          </div>
          <div className="mt-1 text-sm leading-5 text-foreground/65">
            {delivery.deliveryAddress}
          </div>
        </div>
      </div>

      <div className="rounded-md border border-border bg-surface p-3 text-sm text-foreground/65">
        {delivery.actionDetail}
      </div>

      <div className="flex border-t border-border pt-4">
        <DeliveryAction delivery={delivery} />
      </div>
    </article>
  );
}

export default async function CourierPage({ searchParams }: CourierPageProps) {
  const user = await requireAnyRole(["courier", "admin"], {
    redirectPath: "/courier",
  });
  const params = await searchParams;

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

  const renderedAt = new Date();
  const orderedDeliveries = [...dashboard.assignedDeliveries].sort(
    (left, right) =>
      left.actionSortWeight - right.actionSortWeight ||
      left.currentActionStartedAt.getTime() - right.currentActionStartedAt.getTime(),
  );
  const currentDelivery = orderedDeliveries[0] ?? null;
  const urgentOffer = dashboard.offers[0] ?? null;
  const shiftFocus = currentDelivery
    ? {
        title: currentDelivery.orderNumber,
        label: currentDelivery.actionLabel,
        detail: currentDelivery.actionDetail,
        tone: currentDelivery.actionTone,
        meta: `${currentDelivery.currentActionAgeLabel} в текущем шаге`,
      }
    : urgentOffer
      ? {
          title: urgentOffer.orderNumber,
          label: "Ответить на предложение",
          detail: `${urgentOffer.restaurant} -> ${urgentOffer.deliveryAddress}`,
          tone: "accent" as const,
          meta: `осталось ${urgentOffer.expiresInLabel}`,
        }
      : null;

  return (
    <SurfaceShell
      title="Кабинет курьера"
      description={`${dashboard.courier.fullName} · ${dashboard.courier.availabilityStatus}`}
    >
      <RouteAutoRefresh intervalMs={10_000} />

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

      <section className="mt-6 grid gap-4 rounded-lg border border-border bg-surface p-5 md:grid-cols-[1.2fr_0.8fr]">
        <div>
          <div className="text-sm text-foreground/55">Текущий шаг смены</div>
          {shiftFocus ? (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <span className="text-xl font-semibold">{shiftFocus.title}</span>
              <span
                className={`rounded-full border px-3 py-1 text-xs font-medium ${actionToneClassName(shiftFocus.tone)}`}
              >
                {shiftFocus.label}
              </span>
              <span className="text-sm text-foreground/60">{shiftFocus.meta}</span>
            </div>
          ) : (
            <div className="mt-2 text-xl font-semibold">Нет активной задачи</div>
          )}
          {shiftFocus ? (
            <div className="mt-2 text-sm leading-5 text-foreground/60">
              {shiftFocus.detail}
            </div>
          ) : null}
        </div>
        <div className="grid gap-1 text-sm text-foreground/60 md:text-right">
          <div>Доступность: {dashboard.courier.availabilityStatus}</div>
          <div>Транспорт: {dashboard.courier.transportType ?? "не указан"}</div>
          <div>Обновлено: {timeFormatter.format(renderedAt)}</div>
        </div>
      </section>

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
        <h2 className="text-lg font-semibold">Текущий маршрут</h2>
        <div className="mt-5 grid gap-4">
          {orderedDeliveries.length > 0 ? (
            orderedDeliveries.map((delivery) => (
              <AssignedDeliveryCard key={delivery.id} delivery={delivery} />
            ))
          ) : (
            <div className="rounded-lg border border-dashed border-border p-6 text-sm text-foreground/60">
              Активных доставок пока нет.
            </div>
          )}
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
              <CourierOfferCard key={offer.id} offer={offer} />
            ))
          ) : (
            <div className="rounded-lg border border-dashed border-border p-6 text-sm text-foreground/60">
              Сейчас нет новых предложений.
            </div>
          )}
        </div>
      </section>
    </SurfaceShell>
  );
}
