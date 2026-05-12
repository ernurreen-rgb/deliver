import Link from "next/link";
import { redirect } from "next/navigation";
import { AddressPicker } from "@/components/geo/address-picker";
import { SurfaceShell } from "@/components/layout/surface-shell";
import { updateRestaurantLocationAction } from "@/domains/admin/restaurant-location-actions";
import { getAdminRestaurantLocation } from "@/domains/admin/queries";
import { requireAnyRole } from "@/domains/auth/authorization";
import { getTwoGisMapKey } from "@/domains/geo";

export const dynamic = "force-dynamic";

type RestaurantLocationPageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams: Promise<{
    error?: string;
    updated?: string;
  }>;
};

const errorMessages: Record<string, string> = {
  address_required: "Выберите адрес из подсказок или точку на карте в пределах Алматы.",
};

export default async function RestaurantLocationPage({
  params,
  searchParams,
}: RestaurantLocationPageProps) {
  await requireAnyRole(["admin"]);

  const [{ id }, search] = await Promise.all([params, searchParams]);
  const restaurant = await getAdminRestaurantLocation(id);

  if (!restaurant) {
    redirect("/admin/restaurants?error=restaurant_not_found");
  }

  const mapApiKey = getTwoGisMapKey();
  const radiusKm = restaurant.deliveryRadiusMeters
    ? restaurant.deliveryRadiusMeters / 1000
    : 5;
  const errorMessage = search.error ? errorMessages[search.error] : null;

  return (
    <SurfaceShell
      title="Адрес ресторана"
      description={`${restaurant.name} · ${restaurant.status}`}
    >
      <div className="mb-5">
        <Link
          href="/admin/restaurants"
          className="inline-flex rounded-md border border-border px-3 py-2 text-sm text-foreground/70 transition-colors hover:border-accent hover:text-accent"
        >
          Назад к ресторанам
        </Link>
      </div>

      {search.updated ? (
        <div className="mb-5 rounded-lg border border-accent/30 bg-accent/10 p-4 text-sm text-accent">
          Адрес ресторана обновлен.
        </div>
      ) : null}
      {errorMessage ? (
        <div className="mb-5 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
          {errorMessage}
        </div>
      ) : null}

      <section className="rounded-lg border border-border bg-surface p-5">
        <form action={updateRestaurantLocationAction} className="grid gap-5">
          <input name="restaurantId" type="hidden" value={restaurant.id} />

          <AddressPicker
            mapApiKey={mapApiKey}
            initialValue={{
              city: "Алматы",
              addressLine: restaurant.addressLine,
              latitude: restaurant.latitude,
              longitude: restaurant.longitude,
              geoProvider: restaurant.geoProvider,
              geoProviderPlaceId: restaurant.geoProviderPlaceId,
              geoSource: restaurant.geoSource,
            }}
            searchLabel="Адрес ресторана"
          />

          <label className="grid gap-2 text-sm">
            <span className="font-medium">Радиус доставки, км</span>
            <input
              name="deliveryRadiusKm"
              type="number"
              min="0.1"
              max="80"
              step="0.1"
              defaultValue={radiusKm}
              className="h-11 rounded-md border border-border bg-background px-3 outline-none focus:border-accent"
            />
          </label>

          <button className="h-12 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground">
            Сохранить адрес ресторана
          </button>
        </form>
      </section>
    </SurfaceShell>
  );
}
