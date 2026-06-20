import type { MenuItem, RestaurantSummary } from "@deliver/contracts/catalog";

export type CartLine = {
  item: MenuItem;
  quantity: number;
};

export type CustomerCart = {
  restaurant: RestaurantSummary | null;
  lines: CartLine[];
};

export const emptyCart: CustomerCart = {
  restaurant: null,
  lines: [],
};

export function getCartCount(cart: CustomerCart) {
  return cart.lines.reduce((total, line) => total + line.quantity, 0);
}

export function getCartSubtotal(cart: CustomerCart) {
  return cart.lines.reduce(
    (total, line) => total + line.item.price * line.quantity,
    0,
  );
}

export function setCartItemQuantity(
  cart: CustomerCart,
  restaurant: RestaurantSummary,
  item: MenuItem,
  quantity: number,
): CustomerCart {
  const isDifferentRestaurant =
    cart.restaurant && cart.restaurant.id !== restaurant.id;
  const baseLines = isDifferentRestaurant ? [] : cart.lines;
  const nextLines = baseLines.filter((line) => line.item.id !== item.id);

  if (quantity > 0) {
    nextLines.push({ item, quantity: Math.min(99, quantity) });
  }

  return {
    restaurant: nextLines.length > 0 ? restaurant : null,
    lines: nextLines,
  };
}

export function toCartItems(cart: CustomerCart) {
  return cart.lines.map((line) => ({
    menuItemId: line.item.id,
    quantity: line.quantity,
  }));
}
