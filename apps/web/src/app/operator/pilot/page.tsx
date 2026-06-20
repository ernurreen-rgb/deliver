import Link from "next/link";
import { SurfaceShell } from "@/components/layout/surface-shell";
import { InfoTile } from "@/components/shared/info-tile";
import { RouteAutoRefresh } from "@/components/shared/route-auto-refresh";
import { requireAnyRole } from "@/domains/auth/authorization";
import { getPilotReadiness } from "@/domains/pilot/readiness";

export const dynamic = "force-dynamic";

const pilotAccounts = [
  {
    label: "Оператор / ресторан",
    phone: "+77000000001",
    entry: "/operator",
    role: "admin, operator, restaurant",
  },
  {
    label: "Клиент",
    phone: "+77000000002",
    entry: "/",
    role: "customer",
  },
  {
    label: "Курьер",
    phone: "+77000000003",
    entry: "/courier",
    role: "courier",
  },
];

function buildPilotLoginHref(account: (typeof pilotAccounts)[number]) {
  const params = new URLSearchParams({
    phone: account.phone,
    next: account.entry,
  });

  return `/login?${params.toString()}`;
}

const pilotSteps = [
  {
    title: "1. Подготовить окружение",
    owner: "Оператор",
    route: "/operator",
    checks: [
      "Health-check зеленый: database, cron secret, geo provider ready.",
      "Курьер на линии и без активной доставки.",
      "В ресторане есть доступное блюдо выше минимальной суммы заказа.",
    ],
  },
  {
    title: "2. Создать заказ",
    owner: "Клиент",
    route: "/",
    checks: [
      "Войти по телефону клиента через dev OTP.",
      "Выбрать Tengri Kitchen и оформить заказ с оплатой наличными курьеру.",
      "Проверить страницу заказа: статус ждет подтверждения ресторана.",
    ],
  },
  {
    title: "3. Провести ресторан",
    owner: "Ресторан",
    route: "/restaurant",
    checks: [
      "Принять новый заказ и указать время приготовления.",
      "Перевести заказ в приготовление.",
      "Отметить готовность к выдаче.",
    ],
  },
  {
    title: "4. Провести курьера",
    owner: "Курьер",
    route: "/courier",
    checks: [
      "Принять предложение доставки.",
      "После готовности ресторана нажать: Забрал заказ.",
      "Начать доставку и затем закрыть: Доставил.",
    ],
  },
  {
    title: "5. Сверить результат",
    owner: "Оператор",
    route: "/operator",
    checks: [
      "В пилотном журнале заказ должен быть delivered.",
      "Cash state: Наличные закрыты.",
      "Проверить выплаты ресторану, курьеру и выручку платформы.",
    ],
  },
];

const greenCriteria = [
  "Клиент видит публичный номер и актуальный статус заказа.",
  "Ресторан видит заказ в рабочей доске и может довести его до выдачи.",
  "Курьер видит текущий маршрут, pickup/dropoff и закрывает доставку.",
  "Оператор видит заказ в live-диспетчере и пилотном журнале.",
  "Финансы закрыты без онлайн-оплаты: payment paid, ledger entries созданы.",
];

const recoverySteps = [
  {
    title: "Ресторан не подтверждает",
    action: "Открыть /operator, срез Ждет ресторан, связаться с рестораном или отменить заказ с причиной.",
  },
  {
    title: "Курьер не назначается",
    action: "Проверить /operator/couriers, затем в /operator перезапустить поиск или назначить курьера вручную.",
  },
  {
    title: "Заказ готов, но не забран",
    action: "Открыть срез Опаздывает, связаться с курьером или снять курьера до фактического pickup.",
  },
  {
    title: "Оплата не закрылась",
    action: "Проверить Пилотный журнал и Центр проблем. Если есть финансовая сверка, закрыть ее через операторскую форму.",
  },
];

type PilotReadiness = Awaited<ReturnType<typeof getPilotReadiness>>;
type PilotReadinessCheck = PilotReadiness["checks"][number];

const timeFormatter = new Intl.DateTimeFormat("ru-KZ", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function getReadinessStatusLabel(readiness: PilotReadiness) {
  if (readiness.isReady) {
    return "Готов";
  }

  if (readiness.blockedCount > 0) {
    return "Блокеры";
  }

  return "Проверить";
}

function getReadinessCheckLabel(status: PilotReadinessCheck["status"]) {
  if (status === "ready") {
    return "Готово";
  }

  if (status === "warning") {
    return "Проверить";
  }

  return "Блокер";
}

function readinessCheckClassName(status: PilotReadinessCheck["status"]) {
  if (status === "ready") {
    return "border-accent/20 bg-accent/5";
  }

  if (status === "warning") {
    return "border-warning/30 bg-warning/5";
  }

  return "border-warning/50 bg-warning/10";
}

function readinessBadgeClassName(status: PilotReadinessCheck["status"]) {
  if (status === "ready") {
    return "bg-accent/10 text-accent";
  }

  return "bg-warning/10 text-warning";
}

export default async function OperatorPilotPage() {
  await requireAnyRole(["operator", "admin"], {
    redirectPath: "/operator/pilot",
  });
  const readiness = await getPilotReadiness();
  const readinessStatus = getReadinessStatusLabel(readiness);

  return (
    <SurfaceShell
      title="Пилотный runbook"
      description="Пошаговый сценарий для ручных тестовых заказов без SMS и онлайн-оплаты."
    >
      <RouteAutoRefresh intervalMs={10_000} />

      <div className="grid gap-4 md:grid-cols-4">
        <InfoTile
          label="Готовность"
          value={`${readiness.readyCount}/${readiness.totalCount}`}
          tone={readiness.isReady ? "accent" : "warning"}
        />
        <InfoTile
          label="Статус"
          value={readinessStatus}
          tone={readiness.isReady ? "accent" : "warning"}
        />
        <InfoTile
          label="Последний cash"
          value={readiness.latestCashOrder?.number ?? "Нет"}
        />
        <InfoTile label="OTP" value="111111" tone="accent" />
      </div>

      <section className="mt-6 rounded-lg border border-border bg-surface p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Готовность пилота</h2>
            <p className="mt-1 text-sm leading-6 text-foreground/60">
              Автопроверка фикстур, тарифов, окружения и свободного курьера.
              Обновлено: {timeFormatter.format(readiness.updatedAt)}.
            </p>
          </div>
          {readiness.latestCashOrder ? (
            <div className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground/70">
              #{readiness.latestCashOrder.number}: {readiness.latestCashOrder.status},{" "}
              {readiness.latestCashOrder.paymentStatus},{" "}
              {readiness.latestCashOrder.total}
            </div>
          ) : (
            <div className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground/70">
              Cash-order еще не создавался
            </div>
          )}
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {readiness.checks.map((check) => (
            <article
              key={check.key}
              className={`rounded-lg border p-4 ${readinessCheckClassName(
                check.status,
              )}`}
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-sm font-semibold leading-5">{check.label}</h3>
                <span
                  className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${readinessBadgeClassName(
                    check.status,
                  )}`}
                >
                  {getReadinessCheckLabel(check.status)}
                </span>
              </div>
              <p className="mt-3 break-words text-sm leading-6 text-foreground/65">
                {check.detail}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-border bg-surface p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Аккаунты пилота</h2>
            <p className="mt-1 text-sm leading-6 text-foreground/60">
              Все входы в закрытом пилоте проходят через dev OTP. В production
              этот режим должен быть ограничен allowlist телефонов; SMS-провайдер
              будет отдельным этапом.
            </p>
          </div>
          <Link
            href="/operator"
            className="w-fit rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground/75 transition-colors hover:border-accent hover:text-accent"
          >
            К оператору
          </Link>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {pilotAccounts.map((account) => (
            <div
              key={account.phone}
              className="rounded-lg border border-border bg-background p-4"
            >
              <div className="text-sm text-foreground/55">{account.label}</div>
              <div className="mt-2 font-mono text-lg font-semibold">
                {account.phone}
              </div>
              <div className="mt-1 text-sm text-foreground/60">{account.role}</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href={buildPilotLoginHref(account)}
                  className="inline-flex rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground"
                >
                  Войти
                </Link>
                <Link
                  href={account.entry}
                  className="inline-flex rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground/75 transition-colors hover:border-accent hover:text-accent"
                >
                  Открыть экран
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-border bg-surface p-5">
        <h2 className="text-lg font-semibold">Сценарий заказа</h2>
        <div className="mt-5 grid gap-4">
          {pilotSteps.map((step) => (
            <article
              key={step.title}
              className="rounded-lg border border-border bg-background p-4"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="font-semibold">{step.title}</h3>
                  <div className="mt-1 text-sm text-foreground/55">
                    Ответственный: {step.owner}
                  </div>
                </div>
                <Link
                  href={step.route}
                  className="w-fit rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground/75 transition-colors hover:border-accent hover:text-accent"
                >
                  Открыть экран
                </Link>
              </div>
              <ul className="mt-4 grid gap-2 text-sm leading-6 text-foreground/65">
                {step.checks.map((check) => (
                  <li key={check} className="rounded-md bg-surface-muted px-3 py-2">
                    {check}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-accent/30 bg-accent/5 p-5">
          <h2 className="text-lg font-semibold text-accent">Критерии успеха</h2>
          <ul className="mt-4 grid gap-2 text-sm leading-6 text-foreground/70">
            {greenCriteria.map((criterion) => (
              <li
                key={criterion}
                className="rounded-md border border-accent/20 bg-background px-3 py-2"
              >
                {criterion}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-lg border border-warning/30 bg-warning/5 p-5">
          <h2 className="text-lg font-semibold text-warning">Если зависло</h2>
          <div className="mt-4 grid gap-3">
            {recoverySteps.map((step) => (
              <div key={step.title} className="rounded-md bg-background p-3">
                <div className="text-sm font-semibold">{step.title}</div>
                <div className="mt-1 text-sm leading-6 text-foreground/65">
                  {step.action}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-border bg-surface p-5">
        <h2 className="text-lg font-semibold">Команды контроля</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <code className="rounded-md border border-border bg-background p-3 text-sm">
            npm.cmd run release:check-api
          </code>
          <code className="rounded-md border border-border bg-background p-3 text-sm">
            npm.cmd run smoke:cash-order
          </code>
          <code className="rounded-md border border-border bg-background p-3 text-sm">
            npm.cmd run jobs:dispatch-tick
          </code>
        </div>
      </section>
    </SurfaceShell>
  );
}
