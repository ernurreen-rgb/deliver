export type Locale = "ru" | "kk";

export type UserRole =
  | "customer"
  | "restaurant_staff"
  | "courier"
  | "operator"
  | "admin";

export type OrderStatus =
  | "created"
  | "pending_confirmation"
  | "accepted"
  | "preparing"
  | "ready_for_pickup"
  | "courier_assigned"
  | "picked_up"
  | "delivering"
  | "delivered"
  | "cancelled";

export type PaymentMethod = "cash_to_courier" | "online_card";

export type CourierType = "staff" | "partner";

export type RestaurantIntegrationMode =
  | "dashboard"
  | "iiko"
  | "r_keeper"
  | "custom_api";

export type Money = {
  amountMinor: number;
  currency: "KZT";
};
