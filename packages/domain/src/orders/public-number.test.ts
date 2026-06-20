import { describe, expect, it } from "vitest";
import { createPublicOrderNumber } from "./public-number";

describe("createPublicOrderNumber", () => {
  it("uses the stable public order format", () => {
    const publicNumber = createPublicOrderNumber(
      new Date("2026-05-13T06:00:00.000Z"),
    );

    expect(publicNumber).toMatch(/^A-20260513-[A-F0-9]{6}$/);
  });

  it("does not rely only on the timestamp", () => {
    const date = new Date("2026-05-13T06:00:00.000Z");
    const numbers = new Set(
      Array.from({ length: 20 }, () => createPublicOrderNumber(date)),
    );

    expect(numbers.size).toBeGreaterThan(1);
  });
});
