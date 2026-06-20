import { describe, expect, it } from "vitest";
import { getClientIp } from "@/lib/http/client-ip";

describe("getClientIp", () => {
  it("prefers trusted proxy headers before x-forwarded-for", () => {
    const headers = new Headers({
      "cf-connecting-ip": "203.0.113.10",
      "x-real-ip": "203.0.113.20",
      "x-forwarded-for": "203.0.113.30, 10.0.0.1",
    });

    expect(getClientIp(headers)).toBe("203.0.113.10");
  });

  it("uses first x-forwarded-for value as fallback", () => {
    const headers = new Headers({
      "x-forwarded-for": "203.0.113.30, 10.0.0.1",
    });

    expect(getClientIp(headers)).toBe("203.0.113.30");
  });
});
