import { describe, expect, it } from "vitest";
import { createRateLimitBucketKey } from "@/lib/rate-limit";

describe("createRateLimitBucketKey", () => {
  it("keeps raw identifiers out of the bucket key", () => {
    const key = createRateLimitBucketKey({
      namespace: "otp:phone",
      identifier: "+77000000001",
      windowMs: 60_000,
      now: new Date("2026-05-12T10:00:30.000Z"),
    });

    expect(key).toMatch(/^otp:phone:\d+:[a-f0-9]{64}$/);
    expect(key).not.toContain("+77000000001");
  });

  it("uses the same key inside one fixed window", () => {
    const input = {
      namespace: "geo:suggest:user",
      identifier: "user-id",
      windowMs: 60_000,
    };

    expect(
      createRateLimitBucketKey({
        ...input,
        now: new Date("2026-05-12T10:00:01.000Z"),
      }),
    ).toBe(
      createRateLimitBucketKey({
        ...input,
        now: new Date("2026-05-12T10:00:59.000Z"),
      }),
    );
  });
});
