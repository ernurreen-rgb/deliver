import { describe, expect, it } from "vitest";

import {
  calculateDeliveryFee,
  calculateDistanceMeters,
  toNumber,
} from "./pricing";

describe("toNumber", () => {
  it("normalizes nullable and numeric-like values", () => {
    expect(toNumber(null)).toBeNull();
    expect(toNumber(undefined)).toBeNull();
    expect(toNumber("43.238949")).toBe(43.238949);
    expect(toNumber(76.889709)).toBe(76.889709);
  });

  it("rejects non-finite values", () => {
    expect(toNumber("not-a-number")).toBeNull();
    expect(toNumber(Number.NaN)).toBeNull();
    expect(toNumber(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("calculateDistanceMeters", () => {
  it("returns zero for identical coordinates", () => {
    const point = { latitude: 43.238949, longitude: 76.889709 };

    expect(calculateDistanceMeters(point, point)).toBe(0);
  });

  it("calculates a realistic distance between two Almaty points", () => {
    const restaurant = { latitude: 43.238949, longitude: 76.889709 };
    const customer = { latitude: 43.25667, longitude: 76.92861 };

    const distance = calculateDistanceMeters(restaurant, customer);

    expect(distance).toBeGreaterThan(3700);
    expect(distance).toBeLessThan(3800);
  });
});

describe("calculateDeliveryFee", () => {
  it("charges the base fee for zero distance", () => {
    expect(
      calculateDeliveryFee({
        distanceMeters: 0,
        baseFee: 50000,
        perKmFee: 12000,
      }),
    ).toBe(50000);
  });

  it("rounds distance up to the next kilometer", () => {
    expect(
      calculateDeliveryFee({
        distanceMeters: 1,
        baseFee: 50000,
        perKmFee: 12000,
      }),
    ).toBe(62000);

    expect(
      calculateDeliveryFee({
        distanceMeters: 1001,
        baseFee: 50000,
        perKmFee: 12000,
      }),
    ).toBe(74000);
  });

  it("respects min and max fee bounds", () => {
    expect(
      calculateDeliveryFee({
        distanceMeters: 0,
        baseFee: 10000,
        perKmFee: 1000,
        minFee: 25000,
      }),
    ).toBe(25000);

    expect(
      calculateDeliveryFee({
        distanceMeters: 100000,
        baseFee: 50000,
        perKmFee: 12000,
        maxFee: 100000,
      }),
    ).toBe(100000);
  });
});
