"use client";

import { useEffect, useState } from "react";
import type { CartItem, CartState } from "@/domains/cart/types";

const CART_STORAGE_KEY = "deliver.cart.v1";
const CART_UPDATED_EVENT = "deliver-cart-updated";

const emptyCart: CartState = { items: [] };

function readCart(): CartState {
  if (typeof window === "undefined") {
    return emptyCart;
  }

  const raw = window.localStorage.getItem(CART_STORAGE_KEY);

  if (!raw) {
    return emptyCart;
  }

  try {
    const parsed = JSON.parse(raw) as CartState;
    return {
      items: Array.isArray(parsed.items) ? parsed.items : [],
    };
  } catch {
    return emptyCart;
  }
}

function writeCart(cart: CartState) {
  window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
  window.dispatchEvent(new Event(CART_UPDATED_EVENT));
}

export function clearStoredCart() {
  if (typeof window === "undefined") {
    return;
  }

  writeCart(emptyCart);
}

export function useCart() {
  const [cart, setCart] = useState<CartState>(emptyCart);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    function syncCart() {
      setCart(readCart());
      setIsLoaded(true);
    }

    syncCart();
    window.addEventListener("storage", syncCart);
    window.addEventListener(CART_UPDATED_EVENT, syncCart);

    return () => {
      window.removeEventListener("storage", syncCart);
      window.removeEventListener(CART_UPDATED_EVENT, syncCart);
    };
  }, []);

  function addItem(item: Omit<CartItem, "quantity">) {
    const current = readCart();
    const hasDifferentRestaurant = current.items.some(
      (cartItem) => cartItem.restaurantId !== item.restaurantId,
    );

    const nextItems = hasDifferentRestaurant
      ? [{ ...item, quantity: 1 }]
      : current.items.some((cartItem) => cartItem.menuItemId === item.menuItemId)
        ? current.items.map((cartItem) =>
            cartItem.menuItemId === item.menuItemId
              ? { ...cartItem, quantity: cartItem.quantity + 1 }
              : cartItem,
          )
        : [...current.items, { ...item, quantity: 1 }];

    writeCart({ items: nextItems });
  }

  function updateQuantity(menuItemId: string, quantity: number) {
    const current = readCart();
    const nextItems = current.items
      .map((item) =>
        item.menuItemId === menuItemId
          ? { ...item, quantity: Math.max(0, quantity) }
          : item,
      )
      .filter((item) => item.quantity > 0);

    writeCart({ items: nextItems });
  }

  function removeItem(menuItemId: string) {
    const current = readCart();
    writeCart({
      items: current.items.filter((item) => item.menuItemId !== menuItemId),
    });
  }

  function clearCart() {
    clearStoredCart();
  }

  const itemsCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = cart.items.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity,
    0,
  );

  return {
    ...cart,
    isLoaded,
    itemsCount,
    subtotal,
    addItem,
    updateQuantity,
    removeItem,
    clearCart,
  };
}
