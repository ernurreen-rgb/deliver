import { describe, expect, it } from "vitest";
import type { MenuItem, RestaurantSummary } from "@deliver/contracts/catalog";
import {
  emptyCart,
  getCartCount,
  getCartSubtotal,
  setCartItemQuantity,
  toCartItems,
} from "./model";

const restaurant = {
  id: "restaurant-1",
  slug: "tengri-kitchen",
  name: "Tengri Kitchen",
  description: null,
  coverImageUrl: null,
  deliveryTimeMinutes: null,
  minimumOrder: 0,
  currency: "KZT",
  isOpen: true,
} satisfies RestaurantSummary;

const item = {
  id: "item-1",
  categoryId: "category-1",
  name: "Бешбармак",
  description: null,
  imageUrl: null,
  price: 320000,
  currency: "KZT",
  isAvailable: true,
} satisfies MenuItem;

describe("mobile customer cart", () => {
  it("adds, totals and serializes an item", () => {
    const cart = setCartItemQuantity(emptyCart, restaurant, item, 2);

    expect(getCartCount(cart)).toBe(2);
    expect(getCartSubtotal(cart)).toBe(640000);
    expect(toCartItems(cart)).toEqual([{ menuItemId: "item-1", quantity: 2 }]);
  });

  it("removes the restaurant when the final line is removed", () => {
    const cart = setCartItemQuantity(emptyCart, restaurant, item, 1);
    const cleared = setCartItemQuantity(cart, restaurant, item, 0);

    expect(cleared).toEqual(emptyCart);
  });

  it("replaces lines when the customer switches restaurants", () => {
    const firstCart = setCartItemQuantity(emptyCart, restaurant, item, 1);
    const otherRestaurant = { ...restaurant, id: "restaurant-2" };
    const otherItem = { ...item, id: "item-2" };
    const switched = setCartItemQuantity(
      firstCart,
      otherRestaurant,
      otherItem,
      1,
    );

    expect(switched.restaurant?.id).toBe("restaurant-2");
    expect(switched.lines.map((line) => line.item.id)).toEqual(["item-2"]);
  });
});
