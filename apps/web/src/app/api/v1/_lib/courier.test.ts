import { describe, expect, it } from "vitest";
import {
  parseCourierAvailabilityRequest,
  parseCourierDeliveryActionRequest,
  parseCourierOfferActionRequest,
} from "./courier";

describe("courier API request parsers", () => {
  it("accepts explicit availability and offer actions", () => {
    expect(parseCourierAvailabilityRequest({ online: true })).toEqual({
      value: { online: true },
    });
    expect(parseCourierOfferActionRequest({ action: "reject" })).toEqual({
      value: { action: "reject" },
    });
  });

  it("requires cash confirmation for completion", () => {
    const parsed = parseCourierDeliveryActionRequest({ action: "complete" });

    expect("response" in parsed).toBe(true);
    if ("response" in parsed) expect(parsed.response?.status).toBe(400);
  });

  it("trims and bounds the release reason", () => {
    expect(
      parseCourierDeliveryActionRequest({
        action: "release",
        reason: "  Сломался велосипед  ",
      }),
    ).toEqual({
      value: { action: "release", reason: "Сломался велосипед" },
    });

    const tooLong = parseCourierDeliveryActionRequest({
      action: "release",
      reason: "x".repeat(241),
    });
    expect("response" in tooLong).toBe(true);
  });

  it("rejects unsupported actions", () => {
    expect("response" in parseCourierOfferActionRequest({ action: "later" })).toBe(
      true,
    );
    expect(
      "response" in parseCourierDeliveryActionRequest({ action: "teleport" }),
    ).toBe(true);
  });
});
