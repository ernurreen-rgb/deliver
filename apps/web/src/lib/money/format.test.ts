import { describe, expect, it } from "vitest";

import { formatKzt } from "./format";

function normalizeSpaces(value: string) {
  return value.replace(/\s/g, " ");
}

describe("formatKzt", () => {
  it("formats minor units as rounded tenge", () => {
    expect(normalizeSpaces(formatKzt(320000))).toBe("3 200 ₸");
    expect(normalizeSpaces(formatKzt(9999))).toBe("100 ₸");
  });

  it("keeps negative amounts readable for discounts", () => {
    expect(normalizeSpaces(formatKzt(-100000))).toBe("-1 000 ₸");
  });
});
