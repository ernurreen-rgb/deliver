import Link from "next/link";
import { SurfaceShell } from "@/components/layout/surface-shell";
import { requireAnyRole } from "@/domains/auth/authorization";
import { getAdminRestaurants } from "@/domains/admin/queries";

export const dynamic = "force-dynamic";

type AdminRestaurantsPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

const errorMessages: Record<string, string> = {
  invalid_radius: "Радиус доставки должен быть от 0.1 до 80 км.",
  restaurant_required: "Ресторан не передан.",
};

export default async function AdminRestaurantsPage({
  searchParams,
}: AdminRestaurantsPageProps) {
  await requireAnyRole(["admin"]);

  const params = await searchParams;
  const restaurants = await getAdminRestaurants();
  const errorMessage = params.error ? errorMessages[params.error] : null;

  return (
    <SurfaceShell
      title="Рестораны"
      description="Админ управляет адресом, координатами и радиусом доставки ресторанов."
    >
      {errorMessage ? (
        <div className="mb-5 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
          {errorMessage}
        </div>
      ) : null}

      <div className="grid gap-4">
        {restaurants.map((restaurant) => (
          <article
            key={restaurant.id}
            className="rounded-lg border border-border bg-surface p-5"
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-lg font-semibold">{restaurant.name}</h2>
                  <span className="rounded-full bg-surface-muted px-3 py-1 text-xs font-medium text-foreground/65">
                    {restaurant.status}
                  </span>
                </div>
                <div className="mt-2 text-sm text-foreground/65">
                  {restaurant.addressLine}
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-foreground/55">
                  <span>{restaurant.menuItems} блюд</span>
                  <span>{restaurant.staff} сотрудников</span>
                  <span>
                    {restaurant.deliveryRadiusMeters
                      ? `${Math.round(restaurant.deliveryRadiusMeters / 1000)} км`
                      : "радиус не задан"}
                  </span>
                  <span>
                    {restaurant.hasCoordinates ? "координаты есть" : "нет координат"}
                  </span>
                </div>
              </div>
              <Link
                href={`/admin/restaurants/${restaurant.id}/location`}
                className="inline-flex h-10 items-center justify-center rounded-md border border-border px-4 text-sm font-medium text-foreground/75 transition-colors hover:border-accent hover:text-accent"
              >
                Адрес и радиус
              </Link>
            </div>
          </article>
        ))}
      </div>
    </SurfaceShell>
  );
}
