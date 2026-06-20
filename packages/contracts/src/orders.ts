import type { OrderStatus } from "./domain";

export type CashOrderItemInput = {
  menuItemId: string;
  quantity: number;
};

export type DeliveryAddressInput = {
  label?: string;
  addressLine: string;
  apartment?: string;
  entrance?: string;
  floor?: string;
  comment?: string;
  latitude: number;
  longitude: number;
};

export type CartQuoteRequest = {
  restaurantId: string;
  items: CashOrderItemInput[];
  deliveryAddress: DeliveryAddressInput;
};

export type CartQuote = {
  itemsSubtotal: number;
  deliveryFee: number;
  serviceFee: number;
  total: number;
  currency: "KZT";
};

export type CreateCashOrderRequest = CartQuoteRequest & {
  idempotencyKey: string;
  customerComment?: string;
};

export type OrderSummary = {
  id: string;
  number: string;
  restaurantId: string;
  restaurantName: string;
  status: OrderStatus;
  statusLabel: string;
  total: number;
  currency: "KZT";
  createdAt: string;
};

export type OrderStatusEvent = {
  status: OrderStatus;
  label: string;
  occurredAt: string;
};

export type OrderStatusResponse = OrderSummary & {
  events: OrderStatusEvent[];
};
