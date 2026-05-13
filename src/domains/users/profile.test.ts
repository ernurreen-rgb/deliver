import { describe, expect, it } from "vitest";
import {
  isSupportedProfileLanguage,
  normalizeProfileName,
} from "@/domains/users/profile-validation";

describe("customer profile helpers", () => {
  it("normalizes profile names", () => {
    expect(normalizeProfileName("  Ернур   Рахимов  ")).toBe("Ернур Рахимов");
  });

  it("accepts only supported customer UI languages", () => {
    expect(isSupportedProfileLanguage("ru")).toBe(true);
    expect(isSupportedProfileLanguage("kk")).toBe(true);
    expect(isSupportedProfileLanguage("en")).toBe(false);
    expect(isSupportedProfileLanguage("")).toBe(false);
  });
});
