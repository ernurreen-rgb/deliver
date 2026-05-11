"use client";

import { useState } from "react";
import { useCart } from "@/domains/cart/use-cart";
import type { CartItem } from "@/domains/cart/types";

type AddToCartButtonProps = {
  item: Omit<CartItem, "quantity">;
};

export function AddToCartButton({ item }: AddToCartButtonProps) {
  const { addItem } = useCart();
  const [added, setAdded] = useState(false);

  function handleClick() {
    addItem(item);
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1200);
  }

  return (
    <button
      onClick={handleClick}
      className="rounded-md bg-accent px-4 py-3 text-sm font-medium text-accent-foreground transition-colors hover:opacity-90"
    >
      {added ? "Добавлено" : "В корзину"}
    </button>
  );
}
