import Link from "next/link";
import { SurfaceShell } from "@/components/layout/surface-shell";
import { getCurrentUser } from "@/domains/auth/session";
import { getCustomerOrders } from "@/domains/orders/queries";

export const dynamic = "force-dynamic";

const dateFormatter = new Intl.DateTimeFormat("ru-KZ", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function OrdersPage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <SurfaceShell
        title="История заказов"
        description="Войдите по номеру телефона, чтобы видеть текущие и прошлые заказы."
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

  const orders = await getCustomerOrders(user.id);

  return (
    <SurfaceShell
      title="История заказов"
      description="Текущие статусы, сумма, оплата и детали доставки по вашим заказам."
    >
      {orders.length > 0 ? (
        <div className="grid gap-3">
          {orders.map((order) => (
            <Link
              key={order.id}
              href={`/orders/${order.number}`}
              className="grid gap-4 rounded-lg border border-border bg-surface p-5 transition-colors hover:border-accent md:grid-cols-[1fr_auto]"
            >
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-semibold">{order.number}</span>
                  <span className="rounded-full bg-surface-muted px-3 py-1 text-xs font-medium text-foreground/70">
                    {order.statusLabel}
                  </span>
                </div>
                <div className="mt-2 text-sm text-foreground/65">
                  {order.restaurant} · {order.itemsCount} поз. ·{" "}
                  {dateFormatter.format(order.createdAt)}
                </div>
                <div className="mt-2 text-sm text-foreground/55">
                  {order.paymentMethod} · {order.paymentStatus}
                </div>
              </div>
              <div className="flex items-center justify-between gap-4 md:block md:text-right">
                <div className="text-lg font-semibold">{order.total}</div>
                <div className="mt-1 text-sm text-accent">Детали</div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border bg-surface p-6">
          <div className="text-sm text-foreground/60">Заказов пока нет.</div>
          <Link
            href="/"
            className="mt-4 inline-flex rounded-md bg-accent px-4 py-3 text-sm font-medium text-accent-foreground"
          >
            Выбрать ресторан
          </Link>
        </div>
      )}
    </SurfaceShell>
  );
}
