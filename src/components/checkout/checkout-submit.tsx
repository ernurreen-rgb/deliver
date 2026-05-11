"use client";

import { useFormStatus } from "react-dom";
import { useCart } from "@/domains/cart/use-cart";

type CheckoutSubmitProps = {
  hasAddress: boolean;
};

function SubmitButton({
  disabled,
  isLoaded,
}: {
  disabled: boolean;
  isLoaded: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      disabled={disabled || pending}
      className="h-12 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-45"
    >
      {pending
        ? "Создаем заказ"
        : isLoaded
          ? "Создать заказ"
          : "Загрузка корзины"}
    </button>
  );
}

export function CheckoutSubmit({ hasAddress }: CheckoutSubmitProps) {
  const { items, isLoaded } = useCart();
  const cartPayload = JSON.stringify({ items });
  const isDisabled = !hasAddress || !isLoaded || items.length === 0;

  return (
    <div className="grid gap-3">
      <input name="cartPayload" type="hidden" value={cartPayload} />
      {!hasAddress ? (
        <div className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
          Добавьте адрес доставки.
        </div>
      ) : null}
      {isLoaded && items.length === 0 ? (
        <div className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
          Добавьте блюда в корзину.
        </div>
      ) : null}
      <SubmitButton disabled={isDisabled} isLoaded={isLoaded} />
    </div>
  );
}
