import type { OrderStatus } from "@/types/domain";

export const demoRestaurants = [
  {
    id: "rest-1",
    name: "Tengri Kitchen",
    category: "Национальная кухня",
    eta: "30-40 мин",
    distance: "2.4 км",
    rating: "4.8",
    deliveryFee: "от 690 ₸",
  },
  {
    id: "rest-2",
    name: "Green Bowl",
    category: "Боулы и салаты",
    eta: "25-35 мин",
    distance: "1.8 км",
    rating: "4.7",
    deliveryFee: "от 590 ₸",
  },
  {
    id: "rest-3",
    name: "Dala Pizza",
    category: "Пицца",
    eta: "35-45 мин",
    distance: "3.1 км",
    rating: "4.6",
    deliveryFee: "от 790 ₸",
  },
];

export const operatorQueue: Array<{
  number: string;
  restaurant: string;
  status: OrderStatus;
  total: string;
  courier: string;
}> = [
  {
    number: "A-1042",
    restaurant: "Tengri Kitchen",
    status: "pending_confirmation",
    total: "8 450 ₸",
    courier: "Не назначен",
  },
  {
    number: "A-1041",
    restaurant: "Green Bowl",
    status: "courier_assigned",
    total: "5 200 ₸",
    courier: "Аян",
  },
];
