import Link from "next/link";
import { SurfaceShell } from "@/components/layout/surface-shell";
import { PendingSubmitButton } from "@/components/shared/pending-submit-button";
import { requireAnyRole } from "@/domains/auth/authorization";
import { getRestaurantStaffContextForUser } from "@/domains/auth/restaurant-staff-context";
import { updateRestaurantWorkingHoursAction } from "@/domains/restaurants/working-hours-actions";
import {
  getRestaurantWorkingHours,
  getWorkingHoursFieldName,
  type RestaurantWeekday,
} from "@/domains/restaurants/working-hours";

export const dynamic = "force-dynamic";

type RestaurantSettingsPageProps = {
  searchParams: Promise<{
    error?: string;
    updated?: string;
  }>;
};

const weekdayLabels: Record<RestaurantWeekday, string> = {
  1: "Понедельник",
  2: "Вторник",
  3: "Среда",
  4: "Четверг",
  5: "Пятница",
  6: "Суббота",
  7: "Воскресенье",
};

const errorMessages: Record<string, string> = {
  invalid_working_hours:
    "Проверьте время открытия и закрытия. Для рабочего дня нужны разные значения в формате ЧЧ:ММ.",
  restaurant_staff_required:
    "Аккаунт не привязан к ресторану и не может менять расписание.",
};

export default async function RestaurantSettingsPage({
  searchParams,
}: RestaurantSettingsPageProps) {
  const user = await requireAnyRole(["restaurant_staff", "admin"], {
    redirectPath: "/restaurant/settings",
  });
  const params = await searchParams;
  const context = await getRestaurantStaffContextForUser(user);
  const settings = context ? await getRestaurantWorkingHours(context) : null;
  const errorMessage = params.error ? errorMessages[params.error] : null;

  if (!settings) {
    return (
      <SurfaceShell
        title="Настройки ресторана"
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
      title="Настройки ресторана"
      description={`${settings.restaurant.name} · ${settings.restaurant.role}`}
    >
      {params.updated === "working_hours" ? (
        <div className="mb-5 rounded-lg border border-accent/30 bg-accent/10 p-4 text-sm text-accent">
          График работы сохранен.
        </div>
      ) : null}
      {errorMessage ? (
        <div className="mb-5 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
          {errorMessage}
        </div>
      ) : null}

      <div className="mb-5 flex flex-wrap gap-2">
        <Link
          href="/restaurant"
          className="rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground/75 transition-colors hover:border-accent hover:text-accent"
        >
          Заказы
        </Link>
        <Link
          href="/restaurant/menu"
          className="rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground/75 transition-colors hover:border-accent hover:text-accent"
        >
          Меню
        </Link>
      </div>

      <form
        action={updateRestaurantWorkingHoursAction}
        className="border-y border-border bg-surface"
      >
        <div className="hidden grid-cols-[minmax(160px,1fr)_140px_160px_24px_160px] gap-4 border-b border-border px-4 py-3 text-xs font-medium uppercase text-foreground/50 md:grid">
          <span>День</span>
          <span>Статус</span>
          <span>Открытие</span>
          <span />
          <span>Закрытие</span>
        </div>

        {settings.hours.map((hour) => (
          <div
            key={hour.weekday}
            className="grid gap-3 border-b border-border px-4 py-4 last:border-b-0 md:grid-cols-[minmax(160px,1fr)_140px_160px_24px_160px] md:items-center md:gap-4"
          >
            <div>
              <div className="font-medium">{weekdayLabels[hour.weekday]}</div>
              <div className="mt-1 text-xs text-foreground/50">
                {hour.isConfigured ? "Настроено" : "Базовый график"}
              </div>
            </div>

            <label className="flex min-h-10 items-center gap-2 text-sm">
              <input
                name={getWorkingHoursFieldName(hour.weekday, "isClosed")}
                type="checkbox"
                defaultChecked={hour.isClosed}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              <span>Выходной</span>
            </label>

            <label className="grid gap-1 text-sm">
              <span className="text-xs text-foreground/50 md:hidden">
                Открытие
              </span>
              <input
                name={getWorkingHoursFieldName(hour.weekday, "opensAt")}
                type="time"
                defaultValue={hour.opensAt}
                className="h-10 rounded-md border border-border bg-background px-3 outline-none focus:border-accent"
              />
            </label>

            <span className="hidden text-center text-foreground/35 md:block">
              —
            </span>

            <label className="grid gap-1 text-sm">
              <span className="text-xs text-foreground/50 md:hidden">
                Закрытие
              </span>
              <input
                name={getWorkingHoursFieldName(hour.weekday, "closesAt")}
                type="time"
                defaultValue={hour.closesAt}
                className="h-10 rounded-md border border-border bg-background px-3 outline-none focus:border-accent"
              />
            </label>
          </div>
        ))}

        <div className="flex justify-end border-t border-border px-4 py-4">
          <PendingSubmitButton
            pendingText="Сохраняем"
            className="h-11 rounded-md bg-accent px-5 text-sm font-medium text-accent-foreground"
          >
            Сохранить график
          </PendingSubmitButton>
        </div>
      </form>
    </SurfaceShell>
  );
}
