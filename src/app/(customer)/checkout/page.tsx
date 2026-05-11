import Link from "next/link";
import { CartSummary } from "@/components/cart/cart-summary";
import { CheckoutSubmit } from "@/components/checkout/checkout-submit";
import { SurfaceShell } from "@/components/layout/surface-shell";
import { getCurrentUser } from "@/domains/auth/session";
import { createOrderAction } from "@/domains/orders/create-order";
import { getCustomerAddresses } from "@/domains/users/queries";

export const dynamic = "force-dynamic";

type CheckoutPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

const checkoutErrors: Record<string, string> = {
  address_required: "Выберите адрес доставки.",
  address_not_found: "Адрес не найден.",
  cart_changed: "Корзина изменилась. Обновите страницу и проверьте блюда.",
  delivery_rule_missing: "Не настроен тариф доставки.",
  empty_cart: "Корзина пуста.",
  input_too_long: "Проверьте длину комментария или промокода.",
  minimum_order: "Сумма заказа меньше минимума ресторана.",
  missing_coordinates: "Для адреса или ресторана не указаны координаты.",
  outside_radius: "Адрес находится вне радиуса доставки ресторана.",
  payment_unavailable: "Этот способ оплаты пока недоступен.",
  restaurant_unavailable: "Ресторан сейчас недоступен для заказа.",
  single_restaurant_only: "В одном заказе могут быть блюда только одного ресторана.",
};

export default async function CheckoutPage({ searchParams }: CheckoutPageProps) {
  const user = await getCurrentUser();
  const params = await searchParams;
  const errorMessage = params.error ? checkoutErrors[params.error] : null;

  if (!user) {
    return (
      <SurfaceShell
        title="Оформление заказа"
        description="Для оформления заказа нужно войти по номеру телефона."
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

  const addresses = await getCustomerAddresses(user.id);

  return (
    <SurfaceShell
      title="Оформление заказа"
      description="Проверка корзины, адреса, промокода, доставки по расстоянию и способа оплаты."
    >
      {errorMessage ? (
        <div className="mb-5 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
          {errorMessage}
        </div>
      ) : null}

      <form action={createOrderAction} className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <section className="rounded-lg border border-border bg-surface p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Адрес доставки</h2>
              <p className="mt-1 text-sm text-foreground/60">
                Выбранный адрес будет сохранен snapshot в заказе.
              </p>
            </div>
            <Link
              href="/account/addresses"
              className="rounded-md border border-border px-4 py-3 text-center text-sm font-medium text-foreground/75 transition-colors hover:border-accent hover:text-accent"
            >
              Управлять адресами
            </Link>
          </div>

          <div className="mt-5 grid gap-3">
            {addresses.length > 0 ? (
              addresses.map((address, index) => (
                <label
                  key={address.id}
                  className="flex cursor-pointer gap-3 rounded-lg border border-border bg-background p-4 transition-colors hover:border-accent"
                >
                  <input
                    name="addressId"
                    type="radio"
                    value={address.id}
                    defaultChecked={index === 0}
                    className="mt-1 h-4 w-4 accent-[var(--accent)]"
                  />
                  <span>
                    <span className="block font-medium">
                      {address.label ?? "Адрес доставки"}
                    </span>
                    <span className="mt-1 block text-sm text-foreground/65">
                      {address.city}, {address.addressLine}
                    </span>
                    <span className="mt-2 block text-sm text-foreground/55">
                      {[
                        address.apartment && `кв. ${address.apartment}`,
                        address.entrance && `подъезд ${address.entrance}`,
                        address.floor && `этаж ${address.floor}`,
                      ]
                        .filter(Boolean)
                        .join(", ") || "Детали не указаны"}
                    </span>
                  </span>
                </label>
              ))
            ) : (
              <div className="rounded-lg border border-dashed border-border p-5">
                <div className="text-sm text-foreground/65">
                  Добавьте адрес, чтобы продолжить оформление.
                </div>
                <Link
                  href="/account/addresses"
                  className="mt-4 inline-flex rounded-md bg-accent px-4 py-3 text-sm font-medium text-accent-foreground"
                >
                  Добавить адрес
                </Link>
              </div>
            )}
          </div>

          <div className="mt-5 border-t border-border pt-5">
            <label className="grid gap-2 text-sm">
              <span className="font-medium">Комментарий к заказу</span>
              <textarea
                name="customerComment"
                maxLength={500}
                placeholder="Например: позвонить за 5 минут"
                className="min-h-24 rounded-md border border-border bg-background px-3 py-2 outline-none focus:border-accent"
              />
            </label>
          </div>
        </section>

        <aside className="grid h-fit gap-5">
          <section className="rounded-lg border border-border bg-surface p-5">
            <h2 className="text-lg font-semibold">Оплата</h2>
            <div className="mt-4 grid gap-3">
              <label className="flex gap-3 rounded-md border border-border bg-background p-3">
                <input
                  name="paymentMethod"
                  type="radio"
                  value="cash_to_courier"
                  defaultChecked
                  className="mt-1 h-4 w-4 accent-[var(--accent)]"
                />
                <span>
                  <span className="block font-medium">Наличными курьеру</span>
                  <span className="mt-1 block text-sm text-foreground/60">
                    Сумма попадет во внутренний баланс курьера.
                  </span>
                </span>
              </label>
              <label className="flex gap-3 rounded-md border border-border bg-background p-3 opacity-65">
                <input
                  name="paymentMethod"
                  type="radio"
                  value="online_card"
                  disabled
                  className="mt-1 h-4 w-4"
                />
                <span>
                  <span className="block font-medium">Онлайн картой</span>
                  <span className="mt-1 block text-sm text-foreground/60">
                    Подключим после выбора платежного провайдера.
                  </span>
                </span>
              </label>
            </div>
          </section>

          <CartSummary showCheckoutLink={false} />
          <section className="rounded-lg border border-border bg-surface p-5">
            <label className="grid gap-2 text-sm">
              <span className="font-medium">Промокод</span>
              <input
                name="promocode"
                maxLength={32}
                placeholder="START"
                className="h-11 rounded-md border border-border bg-background px-3 uppercase outline-none focus:border-accent"
              />
            </label>
            <div className="mt-5">
              <CheckoutSubmit hasAddress={addresses.length > 0} />
            </div>
          </section>
        </aside>
      </form>
    </SurfaceShell>
  );
}
