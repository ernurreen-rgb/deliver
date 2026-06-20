import type { OrderStatus } from "./domain";

export type CourierStatus =
  | "inactive"
  | "available"
  | "busy"
  | "suspended";

export type CourierDeliveryStatus =
  | "pending_assignment"
  | "assigned"
  | "picked_up"
  | "delivering"
  | "delivered"
  | "cancelled";

export type CourierTransportType = "walking" | "bicycle" | "scooter" | "car";

export type CourierOfferSummary = {
  id: string;
  sequence: number;
  offeredAt: string;
  expiresAt: string;
  orderNumber: string;
  restaurantName: string;
  restaurantAddress: string;
  deliveryAddress: string;
  customerName: string;
  customerPhone: string;
  customerTotal: number | null;
  deliveryFee: number | null;
  itemsCount: number;
  currency: "KZT";
};

export type CourierAssignedDelivery = {
  id: string;
  status: CourierDeliveryStatus;
  orderStatus: OrderStatus;
  assignedAt: string | null;
  pickedUpAt: string | null;
  updatedAt: string;
  orderNumber: string;
  restaurantName: string;
  restaurantAddress: string;
  deliveryAddress: string;
  customerName: string;
  customerPhone: string;
  customerTotal: number | null;
  itemsCount: number;
  currency: "KZT";
};

export type CourierDashboardResponse = {
  courier: {
    status: CourierStatus;
    availabilityStatus: CourierStatus;
    hasLocation: boolean;
    fullName: string;
    phone: string;
    transportType: CourierTransportType | null;
    balance: number;
    currency: "KZT";
  };
  stats: {
    pendingOffers: number;
    assignedDeliveries: number;
  };
  offers: CourierOfferSummary[];
  deliveries: CourierAssignedDelivery[];
  refreshedAt: string;
};

export type UpdateCourierAvailabilityRequest = {
  online: boolean;
};

export type CourierOfferActionRequest = {
  action: "accept" | "reject";
};

export type CourierDeliveryActionRequest =
  | { action: "pickup" }
  | { action: "start" }
  | { action: "complete"; cashCollectedConfirmed: boolean }
  | { action: "release"; reason: string };

export type CourierMutationResponse = {
  dashboard: CourierDashboardResponse;
  orderNumber?: string;
};
