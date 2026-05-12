import Link from "next/link";
import { SurfaceShell } from "@/components/layout/surface-shell";
import { InfoTile } from "@/components/shared/info-tile";
import { requireAnyRole } from "@/domains/auth/authorization";
import { getAdminStats } from "@/domains/admin/queries";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireAnyRole(["admin"]);

  const stats = await getAdminStats();

  return (
    <SurfaceShell
      title="Админка"
      description="Управление ресторанами, пользователями, курьерами, промокодами, тарифами и настройками платформы."
    >
      <div className="grid gap-4 md:grid-cols-4">
        <InfoTile label="Рестораны" value={String(stats.restaurants)} />
        <InfoTile label="Курьеры" value={String(stats.couriers)} />
        <InfoTile label="Промокоды" value={String(stats.promocodes)} tone="accent" />
        <InfoTile label="Заказы" value={String(stats.orders)} />
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/admin/restaurants"
          className="rounded-md border border-border px-4 py-3 text-sm font-medium text-foreground/75 transition-colors hover:border-accent hover:text-accent"
        >
          Рестораны
        </Link>
      </div>
    </SurfaceShell>
  );
}
