"use client";

import Link from "next/link";
import { formatKzt } from "@/lib/money/format";
import { useCart } from "@/domains/cart/use-cart";

type CartSummaryProps = {
  showCheckoutLink?: boolean;
};

export function CartSummary({ showCheckoutLink = true }: CartSummaryProps) {
  const {
    items,
    isLoaded,
    itemsCount,
    subtotal,
    updateQuantity,
    removeItem,
    clearCart,
  } = useCart();

  if (!isLoaded) {
    return (
      <div className="rounded-lg border border-border bg-surface p-5 text-sm text-foreground/60">
        Корзина загружается.
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface p-5">
        <h2 className="text-lg font-semibold">Корзина</h2>
        <p className="mt-2 text-sm text-foreground/60">
          Добавьте блюда из меню ресторана.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Корзина</h2>
          <p className="mt-1 text-sm text-foreground/60">
            {items[0]?.restaurantName} · {itemsCount} поз.
          </p>
        </div>
        <button
          type="button"
          onClick={clearCart}
          className="text-sm font-medium text-foreground/50 hover:text-warning"
        >
          Очистить
        </button>
      </div>

      <div className="mt-5 grid gap-3">
        {items.map((item) => (
          <div key={item.menuItemId} className="border-t border-border pt-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="font-medium">{item.name}</div>
                <div className="mt-1 text-sm text-foreground/60">
                  {formatKzt(item.unitPrice)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeItem(item.menuItemId)}
                className="text-sm text-foreground/45 hover:text-warning"
              >
                Убрать
              </button>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <div className="inline-flex overflow-hidden rounded-md border border-border">
                <button
                  type="button"
                  onClick={() =>
                    updateQuantity(item.menuItemId, item.quantity - 1)
                  }
                  className="h-9 w-9 text-lg text-foreground/70 hover:bg-surface-muted"
                  aria-label="Уменьшить количество"
                >
                  -
                </button>
                <div className="flex h-9 min-w-10 items-center justify-center px-3 text-sm font-medium">
                  {item.quantity}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    updateQuantity(item.menuItemId, item.quantity + 1)
                  }
                  className="h-9 w-9 text-lg text-foreground/70 hover:bg-surface-muted"
                  aria-label="Увеличить количество"
                >
                  +
                </button>
              </div>
              <div className="font-semibold">
                {formatKzt(item.unitPrice * item.quantity)}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 border-t border-border pt-4">
        <div className="flex items-center justify-between">
          <span className="text-foreground/65">Сумма блюд</span>
          <span className="font-semibold">{formatKzt(subtotal)}</span>
        </div>
        {showCheckoutLink ? (
          <Link
            href="/checkout"
            className="mt-4 flex h-12 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground"
          >
            Оформить заказ
          </Link>
        ) : null}
      </div>
    </div>
  );
}
