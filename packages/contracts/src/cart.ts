export type CartItem = {
  menuItemId: string;
  restaurantId: string;
  restaurantSlug: string;
  restaurantName: string;
  name: string;
  description?: string | null;
  unitPrice: number;
  currency: "KZT";
  quantity: number;
};

export type CartState = {
  items: CartItem[];
};
