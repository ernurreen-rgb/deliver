import { describe, expect, it } from "vitest";
import {
  MENU_IMAGE_URL_MAX_LENGTH,
  normalizeMenuImageUrl,
} from "@/domains/menu/image-url";

describe("normalizeMenuImageUrl", () => {
  it("accepts empty image URLs", () => {
    expect(normalizeMenuImageUrl("   ")).toEqual({ ok: true, value: null });
  });

  it("accepts https URLs and strips fragments", () => {
    expect(normalizeMenuImageUrl("https://cdn.example.com/food.jpg#preview")).toEqual(
      {
        ok: true,
        value: "https://cdn.example.com/food.jpg",
      },
    );
  });

  it("rejects unsafe or malformed URLs", () => {
    expect(normalizeMenuImageUrl("javascript:alert(1)")).toEqual({ ok: false });
    expect(normalizeMenuImageUrl("http://example.com/food.jpg")).toEqual({
      ok: false,
    });
    expect(normalizeMenuImageUrl("https://user:pass@example.com/food.jpg")).toEqual(
      {
        ok: false,
      },
    );
    expect(normalizeMenuImageUrl("not-a-url")).toEqual({ ok: false });
  });

  it("rejects overlong URLs", () => {
    expect(
      normalizeMenuImageUrl(`https://example.com/${"a".repeat(MENU_IMAGE_URL_MAX_LENGTH)}`),
    ).toEqual({ ok: false });
  });
});
