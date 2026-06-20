import { describe, expect, it } from "vitest";
import {
  isMenuDemoImagePath,
  MENU_IMAGE_URL_MAX_LENGTH,
  normalizeMenuImageUrl,
} from "./image-url";

describe("normalizeMenuImageUrl", () => {
  it("accepts empty image URLs", () => {
    expect(normalizeMenuImageUrl("   ")).toEqual({ ok: true, value: null });
  });

  it("accepts project-local demo WebP paths", () => {
    expect(normalizeMenuImageUrl(" /images/demo/food-01.webp ")).toEqual({
      ok: true,
      value: "/images/demo/food-01.webp",
    });
    expect(isMenuDemoImagePath("/images/demo/food-01.webp")).toBe(true);
  });

  it("rejects path traversal in project-local paths", () => {
    expect(normalizeMenuImageUrl("/images/demo/../secret.webp")).toEqual({
      ok: false,
    });
  });

  it("rejects query strings and fragments in project-local paths", () => {
    expect(normalizeMenuImageUrl("/images/demo/food.webp?size=large")).toEqual({
      ok: false,
    });
    expect(normalizeMenuImageUrl("/images/demo/food.webp#preview")).toEqual({
      ok: false,
    });
  });

  it("rejects non-WebP project-local paths", () => {
    expect(normalizeMenuImageUrl("/images/demo/food.png")).toEqual({
      ok: false,
    });
  });

  it("rejects unsafe or malformed URLs", () => {
    expect(normalizeMenuImageUrl("javascript:alert(1)")).toEqual({ ok: false });
    expect(normalizeMenuImageUrl("http://example.com/food.jpg")).toEqual({
      ok: false,
    });
    expect(normalizeMenuImageUrl("https://cdn.example.com/food.jpg")).toEqual({
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
      normalizeMenuImageUrl(
        `/images/demo/${"a".repeat(MENU_IMAGE_URL_MAX_LENGTH)}.webp`,
      ),
    ).toEqual({ ok: false });
  });
});
