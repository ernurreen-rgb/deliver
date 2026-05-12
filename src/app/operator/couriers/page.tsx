import Link from "next/link";
import { InfoTile } from "@/components/shared/info-tile";
import { SurfaceShell } from "@/components/layout/surface-shell";
import { requireAnyRole } from "@/domains/auth/authorization";
import {
  updateCourierLocationAction,
  updateCourierProfileAction,
  updateCourierStatusAction,
} from "@/domains/couriers/actions";
import {
  getCourierOperationsDashboard,
  operatorSettableCourierStatuses,
  transportTypes,
} from "@/domains/couriers/operations";
import { formatKzt } from "@/lib/money/format";

export const dynamic = "force-dynamic";

type CourierOperationsPageProps = {
  searchParams: Promise<{
    error?: string;
    updated?: string;
  }>;
};

type CourierRow = Awaited<
  ReturnType<typeof getCourierOperationsDashboard>
>["couriers"][number];

const dateFormatter = new Intl.DateTimeFormat("ru-KZ", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const statusLabels: Record<string, string> = {
  inactive: "Вне линии",
  available: "На линии",
  suspended: "Заблокирован",
};

const transportLabels: Record<string, string> = {
  walking: "Пешком",
  bicycle: "Велосипед",
  scooter: "Самокат",
  car: "Авто",
};

const errorMessages: Record<string, string> = {
  active_delivery_exists: "У курьера есть активная доставка. Сначала завершите или снимите ее.",
  courier_location_required: "Перед выходом на линию нужна геопозиция курьера.",
  courier_not_found: "Курьер не найден.",
  courier_required: "Не передан курьер.",
  input_too_long: "Текст слишком длинный.",
  invalid_courier_status: "Такой статус нельзя установить вручную.",
  invalid_location: "Координаты должны быть внутри Алматы.",
  invalid_transport: "Неизвестный тип транспорта.",
  profile_required: "Укажите имя и телефон курьера.",
};

function courierStatusClassName(status: string) {
  if (status === "available") {
    return "bg-accent/10 text-accent";
  }

  if (status === "busy") {
    return "bg-warning/10 text-warning";
  }

  if (status === "suspended") {
    return "bg-warning/10 text-warning";
  }

  return "bg-surface-muted text-foreground/70";
}

function CoordinateText({ courier }: { courier: CourierRow }) {
  if (!courier.availability.hasLocation) {
    return <span>Не указана</span>;
  }

  return (
    <span>
      {courier.availability.latitude?.toFixed(6)},{" "}
      {courier.availability.longitude?.toFixed(6)}
    </span>
  );
}

function CourierProfileForm({ courier }: { courier: CourierRow }) {
  return (
    <form
      action={updateCourierProfileAction}
      className="grid gap-3 border-t border-border pt-4 md:grid-cols-[1fr_150px_140px_150px_auto]"
    >
      <input name="courierId" type="hidden" value={courier.id} />
      <input
        name="fullName"
        maxLength={120}
        defaultValue={courier.profile.fullName}
        placeholder="ФИО"
        className="h-10 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-accent"
      />
      <input
        name="phone"
        maxLength={40}
        defaultValue={courier.profile.phone}
        placeholder="Телефон"
        className="h-10 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-accent"
      />
      <select
        name="transportType"
        defaultValue={courier.profile.transportType}
        className="h-10 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-accent"
      >
        {transportTypes.map((type) => (
          <option key={type} value={type}>
            {transportLabels[type]}
          </option>
        ))}
      </select>
      <input
        name="documentNumber"
        maxLength={120}
        defaultValue={courier.profile.documentNumber}
        placeholder="Документ"
        className="h-10 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-accent"
      />
      <button
        type="submit"
        className="h-10 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground"
      >
        Сохранить
      </button>
    </form>
  );
}

function CourierStatusForm({ courier }: { courier: CourierRow }) {
  return (
    <form
      action={updateCourierStatusAction}
      className="grid gap-3 border-t border-border pt-4 sm:grid-cols-[180px_auto_1fr]"
    >
      <input name="courierId" type="hidden" value={courier.id} />
      <select
        name="status"
        defaultValue={
          operatorSettableCourierStatuses.includes(
            courier.status as (typeof operatorSettableCourierStatuses)[number],
          )
            ? courier.status
            : "inactive"
        }
        disabled={!courier.canChangeStatus}
        className="h-10 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-accent disabled:opacity-60"
      >
        {operatorSettableCourierStatuses.map((status) => (
          <option key={status} value={status}>
            {statusLabels[status]}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={!courier.canChangeStatus}
        className="h-10 rounded-md border border-border px-4 text-sm font-medium text-foreground/75 transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
      >
        Обновить статус
      </button>
      {!courier.canChangeStatus ? (
        <div className="text-sm text-warning">
          Статус заблокирован, пока есть активная доставка.
        </div>
      ) : courier.status !== "available" && !courier.availability.hasLocation ? (
        <div className="text-sm text-foreground/55">
          Для выхода на линию сначала задайте геопозицию.
        </div>
      ) : null}
    </form>
  );
}

function CourierLocationForm({ courier }: { courier: CourierRow }) {
  return (
    <form
      action={updateCourierLocationAction}
      className="grid gap-3 border-t border-border pt-4 sm:grid-cols-[160px_160px_auto_1fr]"
    >
      <input name="courierId" type="hidden" value={courier.id} />
      <input
        name="latitude"
        inputMode="decimal"
        defaultValue={courier.availability.latitude?.toFixed(6) ?? ""}
        placeholder="43.238949"
        className="h-10 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-accent"
      />
      <input
        name="longitude"
        inputMode="decimal"
        defaultValue={courier.availability.longitude?.toFixed(6) ?? ""}
        placeholder="76.889709"
        className="h-10 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-accent"
      />
      <button
        type="submit"
        className="h-10 rounded-md border border-border px-4 text-sm font-medium text-foreground/75 transition-colors hover:border-accent hover:text-accent"
      >
        Обновить точку
      </button>
      <div className="text-sm text-foreground/55">
        Сейчас: <CoordinateText courier={courier} />
      </div>
    </form>
  );
}

function CourierDeliveries({ courier }: { courier: CourierRow }) {
  return (
    <div className="border-t border-border pt-4">
      <div className="text-sm font-semibold">Активные доставки</div>
      {courier.activeDeliveries.length > 0 ? (
        <div className="mt-3 grid gap-2">
          {courier.activeDeliveries.map((delivery) => (
            <div
              key={delivery.id}
              className="grid gap-2 text-sm text-foreground/65 md:grid-cols-[130px_1fr_110px_100px]"
            >
              <span className="font-medium text-foreground">
                {delivery.orderNumber}
              </span>
              <span>{delivery.restaurant}</span>
              <span>{delivery.statusLabel}</span>
              <span>{delivery.total === null ? "-" : formatKzt(delivery.total)}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-2 text-sm text-foreground/55">
          Активных доставок нет.
        </div>
      )}
    </div>
  );
}

function CourierRefusals({ courier }: { courier: CourierRow }) {
  return (
    <div className="border-t border-border pt-4">
      <div className="text-sm font-semibold">История отказов</div>
      {courier.refusalHistory.length > 0 ? (
        <div className="mt-3 grid gap-2">
          {courier.refusalHistory.map((offer) => (
            <div
              key={offer.id}
              className="grid gap-2 text-sm text-foreground/65 md:grid-cols-[130px_1fr_100px_140px]"
            >
              <span className="font-medium text-foreground">
                {offer.orderNumber}
              </span>
              <span>{offer.restaurant}</span>
              <span>{offer.statusLabel}</span>
              <span>
                {dateFormatter.format(offer.respondedAt ?? offer.offeredAt)}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-2 text-sm text-foreground/55">
          Отказов и пропущенных предложений нет.
        </div>
      )}
    </div>
  );
}

function CourierCard({ courier }: { courier: CourierRow }) {
  return (
    <article className="grid gap-4 rounded-lg border border-border bg-background p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-semibold">
              {courier.profile.fullName || courier.userPhone}
            </span>
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${courierStatusClassName(courier.status)}`}
            >
              {courier.statusLabel}
            </span>
            <span className="rounded-full bg-surface-muted px-3 py-1 text-xs font-medium text-foreground/70">
              {courier.profile.transportLabel}
            </span>
          </div>
          <div className="mt-2 text-sm text-foreground/60">
            {courier.profile.phone} · аккаунт {courier.userPhone} ·{" "}
            {courier.userStatus}
          </div>
          <div className="mt-1 text-sm text-foreground/60">
            Геопозиция: <CoordinateText courier={courier} />
          </div>
        </div>
        <div className="grid gap-1 text-sm lg:text-right">
          <div className="font-semibold">{formatKzt(courier.balance.amount)}</div>
          <div className="text-foreground/55">
            Активных доставок: {courier.activeDeliveryCount}
          </div>
          <div className="text-foreground/55">
            Доступность: {courier.availability.statusLabel}
          </div>
        </div>
      </div>

      <CourierProfileForm courier={courier} />
      <CourierStatusForm courier={courier} />
      <CourierLocationForm courier={courier} />
      <CourierDeliveries courier={courier} />
      <CourierRefusals courier={courier} />
    </article>
  );
}

export default async function CourierOperationsPage({
  searchParams,
}: CourierOperationsPageProps) {
  await requireAnyRole(["operator", "admin"]);

  const params = await searchParams;
  const dashboard = await getCourierOperationsDashboard();
  const errorMessage = params.error ? errorMessages[params.error] : null;

  return (
    <SurfaceShell
      title="Управление курьерами"
      description="Профили, транспорт, статус линии, геопозиция, активные доставки и история отказов."
    >
      {params.updated ? (
        <div className="mb-5 rounded-lg border border-accent/30 bg-accent/10 p-4 text-sm text-accent">
          Курьер обновлен: {params.updated}.
        </div>
      ) : null}
      {errorMessage ? (
        <div className="mb-5 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
          {errorMessage}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-4">
        <InfoTile label="Всего" value={String(dashboard.stats.total)} />
        <InfoTile
          label="На линии"
          value={String(dashboard.stats.available)}
          tone={dashboard.stats.available > 0 ? "accent" : "default"}
        />
        <InfoTile
          label="На заказе"
          value={String(dashboard.stats.busy)}
          tone={dashboard.stats.busy > 0 ? "warning" : "default"}
        />
        <InfoTile
          label="Заблокированы"
          value={String(dashboard.stats.suspended)}
          tone={dashboard.stats.suspended > 0 ? "warning" : "default"}
        />
      </div>

      <div className="mt-5 flex justify-end">
        <Link
          href="/operator"
          className="rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground/75 transition-colors hover:border-accent hover:text-accent"
        >
          Назад в операторскую
        </Link>
      </div>

      <section className="mt-6 rounded-lg border border-border bg-surface p-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">Курьеры</h2>
          <p className="text-sm text-foreground/60">
            Оператор меняет только рабочие параметры. Статус на заказе
            выставляется автоматически при назначении доставки.
          </p>
        </div>

        <div className="mt-5 grid gap-4">
          {dashboard.couriers.length > 0 ? (
            dashboard.couriers.map((courier) => (
              <CourierCard key={courier.id} courier={courier} />
            ))
          ) : (
            <div className="rounded-lg border border-dashed border-border p-6 text-sm text-foreground/60">
              Курьеры пока не созданы.
            </div>
          )}
        </div>
      </section>
    </SurfaceShell>
  );
}
