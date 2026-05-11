import Link from "next/link";
import { AppHeader } from "@/components/layout/app-header";
import { appRoutes } from "@/config/app";
import { getStorefrontRestaurants } from "@/domains/restaurants/queries";

export const dynamic = "force-dynamic";

export default async function CustomerHomePage() {
  const restaurants = await getStorefrontRestaurants();

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[280px_1fr]">
        <aside className="h-fit rounded-lg border border-border bg-surface p-4">
          <div className="text-sm font-medium text-foreground/60">
            Адрес доставки
          </div>
          <div className="mt-2 text-lg font-semibold">Алматы</div>
          <Link
            href={appRoutes.login}
            className="mt-4 flex w-full items-center justify-center rounded-md bg-accent px-4 py-3 text-sm font-medium text-accent-foreground"
          >
            Войти по телефону
          </Link>
          <div className="mt-5 border-t border-border pt-5">
            <div className="text-sm font-medium text-foreground/60">
              Язык
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button className="rounded-md border border-accent bg-accent/10 px-3 py-2 text-sm text-accent">
                Рус
              </button>
              <button className="rounded-md border border-border px-3 py-2 text-sm text-foreground/70">
                Қаз
              </button>
            </div>
          </div>
        </aside>

        <section>
          <div className="mb-6">
            <h1 className="text-3xl font-semibold tracking-normal text-foreground">
              Рестораны рядом
            </h1>
            <p className="mt-2 text-foreground/65">
              Каталог будет наполняться реальными партнерами. Доступность заказа
              считается по радиусу ресторана и адресу клиента.
            </p>
          </div>

          <div className="mb-5 flex flex-wrap gap-2">
            {["Все", "Популярное", "Быстро", "С промокодом"].map((filter) => (
              <button
                key={filter}
                className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground/75"
              >
                {filter}
              </button>
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {restaurants.map((restaurant) => (
              <Link
                key={restaurant.id}
                href={`/restaurants/${restaurant.slug}`}
                className="rounded-lg border border-border bg-surface p-4 transition-colors hover:border-accent"
              >
                <div className="flex aspect-[16/9] items-center justify-center rounded-md bg-surface-muted text-sm text-foreground/50">
                  Фото ресторана
                </div>
                <div className="mt-4 flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold">{restaurant.name}</h2>
                    <p className="mt-1 text-sm text-foreground/60">
                      {restaurant.category}
                    </p>
                  </div>
                  <span className="rounded-md bg-accent/10 px-2 py-1 text-sm font-medium text-accent">
                    {restaurant.rating}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-sm text-foreground/65">
                  <span>{restaurant.eta}</span>
                  <span>{restaurant.distance}</span>
                  <span>{restaurant.deliveryFee}</span>
                </div>
                <p className="mt-3 text-sm text-foreground/55">
                  Минимальный заказ: {restaurant.minimumOrder}
                </p>
              </Link>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
