import Link from "next/link";
import { notFound } from "next/navigation";
import { ClearCartEffect } from "@/components/cart/clear-cart-effect";
import { SurfaceShell } from "@/components/layout/surface-shell";
import { getCurrentUser } from "@/domains/auth/session";
import {
  getCustomerOrderByPublicNumber,
  getOrderStatusLabel,
} from "@/domains/orders/queries";
import { formatKzt } from "@/lib/money/format";

export const dynamic = "force-dynamic";

type OrderDetailPageProps = {
  params: Promise<{
    number: string;
  }>;
  searchParams: Promise<{
    created?: string;
  }>;
};

const dateFormatter = new Intl.DateTimeFormat("ru-KZ", {
  day: "2-digit",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

const deliveryStatusLabels: Record<string, string> = {
  pending_assignment: "Ищем курьера",
  assigned: "Курьер назначен",
  picked_up: "Курьер забрал заказ",
  delivering: "Курьер в пути",
  delivered: "Доставлен",
  cancelled: "Отменена",
};

function FinancialRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "muted" | "strong";
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className={tone === "muted" ? "text-foreground/55" : "text-foreground/70"}>
        {label}
      </span>
      <span className={tone === "strong" ? "font-semibold" : ""}>
        {formatKzt(value)}
      </span>
    </div>
  );
}

export default async function OrderDetailPage({
  params,
  searchParams,
}: OrderDetailPageProps) {
  const user = await getCurrentUser();
  const { number } = await params;
  const query = await searchParams;

  if (!user) {
    return (
      <SurfaceShell
        title="Заказ"
        description="Войдите по номеру телефона, чтобы открыть детали заказа."
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

  const order = await getCustomerOrderByPublicNumber({
    customerId: user.id,
    publicNumber: number,
  });

  if (!order) {
    notFound();
  }

  const financials = order.financials;
  const address = order.deliveryAddress;
  const payment = order.payments[0];
  const deliveryStatus = order.delivery?.status ?? "pending_assignment";
  const courierName = order.delivery?.courier?.profile?.fullName;
  const distanceKm = order.deliveryFeeCalculation
    ? (order.deliveryFeeCalculation.distanceMeters / 1000).toFixed(1)
    : null;

  return (
    <SurfaceShell
      title={`Заказ ${order.publicNumber}`}
      description={`${order.restaurantName} · ${dateFormatter.format(order.createdAt)}`}
    >
      {query.created === "1" ? <ClearCartEffect /> : null}

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="grid gap-5">
          <section className="rounded-lg border border-border bg-surface p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-sm text-foreground/55">Статус заказа</div>
                <h2 className="mt-1 text-xl font-semibold">{order.statusLabel}</h2>
              </div>
              <span className="w-fit rounded-full bg-surface-muted px-3 py-1 text-xs font-medium text-foreground/70">
                {order.paymentStatusLabel}
              </span>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-md border border-border bg-background p-4">
                <div className="text-sm text-foreground/55">Доставка</div>
                <div className="mt-1 font-medium">
                  {deliveryStatusLabels[deliveryStatus] ?? deliveryStatus}
                </div>
              </div>
              <div className="rounded-md border border-border bg-background p-4">
                <div className="text-sm text-foreground/55">Курьер</div>
                <div className="mt-1 font-medium">
                  {courierName ?? "Пока не назначен"}
                </div>
              </div>
              <div className="rounded-md border border-border bg-background p-4">
                <div className="text-sm text-foreground/55">Расстояние</div>
                <div className="mt-1 font-medium">
                  {distanceKm ? `${distanceKm} км` : "Будет рассчитано"}
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-border bg-surface p-5">
            <h2 className="text-lg font-semibold">Состав заказа</h2>
            <div className="mt-4 grid gap-3">
              {order.items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start justify-between gap-4 border-t border-border pt-3 first:border-t-0 first:pt-0"
                >
                  <div>
                    <div className="font-medium">{item.nameSnapshot}</div>
                    <div className="mt-1 text-sm text-foreground/55">
                      {item.quantity} × {formatKzt(item.unitPrice)}
                    </div>
                  </div>
                  <div className="font-semibold">{formatKzt(item.totalPrice)}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-border bg-surface p-5">
            <h2 className="text-lg font-semibold">Адрес доставки</h2>
            {address ? (
              <div className="mt-3 text-sm leading-6 text-foreground/70">
                <div className="font-medium text-foreground">
                  {address.city}, {address.addressLine}
                </div>
                <div>
                  {[address.apartment && `кв. ${address.apartment}`, address.entrance && `подъезд ${address.entrance}`, address.floor && `этаж ${address.floor}`]
                    .filter(Boolean)
                    .join(", ") || "Детали адреса не указаны"}
                </div>
                {address.comment ? <div>{address.comment}</div> : null}
              </div>
            ) : (
              <div className="mt-3 text-sm text-foreground/60">
                Адрес не найден.
              </div>
            )}
          </section>

          <section className="rounded-lg border border-border bg-surface p-5">
            <h2 className="text-lg font-semibold">История статусов</h2>
            <div className="mt-4 grid gap-3">
              {order.statusHistory.map((event) => (
                <div key={event.id} className="border-t border-border pt-3 first:border-t-0 first:pt-0">
                  <div className="font-medium">
                    {getOrderStatusLabel(event.toStatus)}
                  </div>
                  <div className="mt-1 text-sm text-foreground/55">
                    {dateFormatter.format(event.createdAt)}
                    {event.comment ? ` · ${event.comment}` : ""}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="grid h-fit gap-5">
          <section className="rounded-lg border border-border bg-surface p-5">
            <h2 className="text-lg font-semibold">Оплата</h2>
            <div className="mt-4 grid gap-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <span className="text-foreground/70">Способ</span>
                <span className="font-medium">{order.paymentMethodLabel}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-foreground/70">Платеж</span>
                <span className="font-medium">
                  {payment ? order.paymentStatusLabel : "Не создан"}
                </span>
              </div>
              {financials ? (
                <>
                  <FinancialRow label="Блюда" value={financials.itemsSubtotal} />
                  <FinancialRow label="Доставка" value={financials.deliveryFee} />
                  <FinancialRow label="Сервисный сбор" value={financials.serviceFee} />
                  {financials.discountTotal > 0 ? (
                    <FinancialRow
                      label="Скидка"
                      value={-financials.discountTotal}
                      tone="muted"
                    />
                  ) : null}
                  <div className="border-t border-border pt-3">
                    <FinancialRow
                      label="Итого"
                      value={financials.customerTotal}
                      tone="strong"
                    />
                  </div>
                </>
              ) : null}
            </div>
          </section>

          {order.promoRedemptions.length > 0 ? (
            <section className="rounded-lg border border-border bg-surface p-5">
              <h2 className="text-lg font-semibold">Промокод</h2>
              <div className="mt-3 text-sm text-foreground/70">
                {order.promoRedemptions.map((redemption) => (
                  <div key={redemption.id}>
                    {redemption.promocode.code} · -{formatKzt(redemption.discountAmount)}
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <Link
            href="/orders"
            className="flex h-11 items-center justify-center rounded-md border border-border text-sm font-medium text-foreground/75 transition-colors hover:border-accent hover:text-accent"
          >
            Все заказы
          </Link>
        </aside>
      </div>
    </SurfaceShell>
  );
}
