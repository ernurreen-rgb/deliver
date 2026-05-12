import { describe, expect, it } from "vitest";
import {
  buildOperatorAttention,
  minutesSince,
} from "@/domains/orders/operator-attention";

const baseInput = {
  orderStatus: "accepted",
  deliveryStatus: "assigned",
  hasDelivery: true,
  hasCourier: true,
  hasPendingOffer: false,
  hasRestaurantCoordinates: true,
  statusAgeMinutes: 1,
  deliveryAgeMinutes: 1,
};

describe("buildOperatorAttention", () => {
  it("keeps fresh restaurant confirmation in automatic watch state", () => {
    const attention = buildOperatorAttention({
      ...baseInput,
      orderStatus: "pending_confirmation",
      deliveryStatus: null,
      hasDelivery: false,
      hasCourier: false,
      statusAgeMinutes: 2,
      deliveryAgeMinutes: 0,
    });

    expect(attention).toMatchObject({
      level: "watch",
      isProblem: false,
      title: "Ждем подтверждение ресторана",
    });
  });

  it("marks stale restaurant confirmation as operator problem", () => {
    const attention = buildOperatorAttention({
      ...baseInput,
      orderStatus: "pending_confirmation",
      deliveryStatus: null,
      hasDelivery: false,
      hasCourier: false,
      statusAgeMinutes: 6,
      deliveryAgeMinutes: 0,
    });

    expect(attention).toMatchObject({
      level: "warning",
      isProblem: true,
      title: "Ресторан не подтвердил заказ",
    });
  });

  it("marks ready orders without courier as critical", () => {
    const attention = buildOperatorAttention({
      ...baseInput,
      orderStatus: "ready_for_pickup",
      deliveryStatus: "pending_assignment",
      hasCourier: false,
      deliveryAgeMinutes: 3,
    });

    expect(attention).toMatchObject({
      level: "critical",
      isProblem: true,
      title: "Заказ готов, но курьера нет",
    });
  });

  it("does not interrupt active courier offers", () => {
    const attention = buildOperatorAttention({
      ...baseInput,
      orderStatus: "preparing",
      deliveryStatus: "pending_assignment",
      hasCourier: false,
      hasPendingOffer: true,
      deliveryAgeMinutes: 1,
    });

    expect(attention).toMatchObject({
      level: "watch",
      isProblem: false,
      title: "Курьеру отправлено предложение",
    });
  });

  it("detects delayed pickup after restaurant marks order ready", () => {
    const attention = buildOperatorAttention({
      ...baseInput,
      orderStatus: "ready_for_pickup",
      deliveryStatus: "assigned",
      deliveryAgeMinutes: 10,
    });

    expect(attention).toMatchObject({
      level: "warning",
      isProblem: true,
      title: "Курьер не забирает готовый заказ",
    });
  });
});

describe("minutesSince", () => {
  it("formats elapsed full minutes without going below zero", () => {
    const now = new Date("2026-05-12T10:05:30.000Z");

    expect(minutesSince(new Date("2026-05-12T10:00:00.000Z"), now)).toBe(5);
    expect(minutesSince(new Date("2026-05-12T10:06:00.000Z"), now)).toBe(0);
  });
});
