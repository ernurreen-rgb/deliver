import { notFound } from "next/navigation";
import { AddToCartButton } from "@/components/cart/add-to-cart-button";
import { CartSummary } from "@/components/cart/cart-summary";
import { SurfaceShell } from "@/components/layout/surface-shell";
import { getRestaurantMenu } from "@/domains/restaurants/queries";

type RestaurantPageProps = {
  params: Promise<{ id: string }>;
};

export const dynamic = "force-dynamic";

export default async function RestaurantPage({ params }: RestaurantPageProps) {
  const { id } = await params;
  const restaurant = await getRestaurantMenu(id);

  if (!restaurant) {
    notFound();
  }

  return (
    <SurfaceShell
      title={restaurant.name}
      description={
        restaurant.description ??
        `Минимальный заказ ${restaurant.minimumOrder}. Радиус доставки: ${restaurant.deliveryRadius}.`
      }
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="grid gap-5">
          {restaurant.categories.map((category) => (
            <section
              key={category.id}
              className="rounded-lg border border-border bg-surface p-5"
            >
              <h2 className="text-xl font-semibold">{category.name}</h2>
              <div className="mt-4 grid gap-3">
                {category.items.length > 0 ? (
                  category.items.map((item) => (
                    <article
                      key={item.id}
                      className="grid gap-4 rounded-lg border border-border bg-background p-4 sm:grid-cols-[1fr_auto]"
                    >
                      <div>
                        <h3 className="font-semibold">{item.name}</h3>
                        {item.description ? (
                          <p className="mt-2 text-sm leading-6 text-foreground/60">
                            {item.description}
                          </p>
                        ) : null}
                        <div className="mt-3 font-semibold">
                          {item.formattedPrice}
                        </div>
                      </div>
                      <div className="flex items-center sm:justify-end">
                        {item.isAvailable ? (
                          <AddToCartButton
                            item={{
                              menuItemId: item.id,
                              restaurantId: restaurant.id,
                              restaurantSlug: restaurant.slug,
                              restaurantName: restaurant.name,
                              name: item.name,
                              description: item.description,
                              unitPrice: item.price,
                              currency: item.currency,
                            }}
                          />
                        ) : (
                          <span className="rounded-md border border-border px-4 py-3 text-sm text-foreground/50">
                            Недоступно
                          </span>
                        )}
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="rounded-lg border border-dashed border-border p-5 text-sm text-foreground/60">
                    В этой категории пока нет блюд.
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>
        <aside className="h-fit lg:sticky lg:top-4">
          <CartSummary />
        </aside>
      </div>
    </SurfaceShell>
  );
}
