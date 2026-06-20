export type RestaurantSummary = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  coverImageUrl: string | null;
  deliveryTimeMinutes: number | null;
  minimumOrder: number;
  currency: "KZT";
  isOpen: boolean;
};

export type MenuItem = {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  price: number;
  currency: "KZT";
  isAvailable: boolean;
};

export type MenuCategory = {
  id: string;
  name: string;
  sortOrder: number;
  items: MenuItem[];
};

export type RestaurantMenu = {
  restaurant: RestaurantSummary;
  categories: MenuCategory[];
};
