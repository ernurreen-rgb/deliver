import { describe, expect, it } from "vitest";
import {
  CLOSED_PILOT_OTP_ENABLED_ENV,
  CLOSED_PILOT_OTP_PHONE_ALLOWLIST_ENV,
  OTP_MAX_ATTEMPTS,
  OTP_RATE_LIMIT_WINDOW_MS,
  OTP_REQUEST_IP_LIMIT,
  OTP_REQUEST_PHONE_LIMIT,
  OTP_REQUEST_RATE_LIMIT_ERROR,
  OTP_VERIFY_IP_LIMIT,
  OTP_VERIFY_PHONE_LIMIT,
  OTP_VERIFY_RATE_LIMIT_ERROR,
  isDevOtpEnabled,
  isDevOtpPhoneAllowed,
  parseClosedPilotOtpPhoneAllowlist,
  shouldExposeDevOtpCode,
} from "@/domains/auth/constants";

describe("OTP security constants", () => {
  it("keeps request and verify throttles explicit", () => {
    expect(OTP_RATE_LIMIT_WINDOW_MS).toBe(15 * 60 * 1000);
    expect(OTP_REQUEST_PHONE_LIMIT).toBe(5);
    expect(OTP_REQUEST_IP_LIMIT).toBe(30);
    expect(OTP_VERIFY_PHONE_LIMIT).toBe(10);
    expect(OTP_VERIFY_IP_LIMIT).toBe(60);
  });

  it("separates rate-limit errors from per-challenge attempts", () => {
    expect(OTP_VERIFY_PHONE_LIMIT).toBeGreaterThanOrEqual(OTP_MAX_ATTEMPTS);
    expect(OTP_REQUEST_RATE_LIMIT_ERROR).toBe("too_many_requests");
    expect(OTP_VERIFY_RATE_LIMIT_ERROR).toBe("too_many_otp_attempts");
    expect(OTP_VERIFY_RATE_LIMIT_ERROR).not.toBe(OTP_REQUEST_RATE_LIMIT_ERROR);
  });

  it("keeps dev OTP open outside production only", () => {
    expect(isDevOtpEnabled({ NODE_ENV: "development", OTP_PROVIDER: "dev" })).toBe(
      true,
    );
    expect(shouldExposeDevOtpCode({ NODE_ENV: "development", OTP_PROVIDER: "dev" }))
      .toBe(true);
  });

  it("requires closed-pilot flag and allowlist for production dev OTP", () => {
    const env = {
      NODE_ENV: "production",
      OTP_PROVIDER: "dev",
      [CLOSED_PILOT_OTP_ENABLED_ENV]: "true",
      [CLOSED_PILOT_OTP_PHONE_ALLOWLIST_ENV]: "+77000000001, 87000000002",
    };

    expect(parseClosedPilotOtpPhoneAllowlist(env)).toEqual({
      invalidEntries: [],
      phones: ["+77000000001", "+77000000002"],
    });
    expect(isDevOtpEnabled(env)).toBe(true);
    expect(isDevOtpPhoneAllowed("+77000000001", env)).toBe(true);
    expect(isDevOtpPhoneAllowed("+77000000003", env)).toBe(false);
    expect(shouldExposeDevOtpCode(env)).toBe(false);
  });

  it("blocks production dev OTP without explicit closed-pilot safeguards", () => {
    expect(isDevOtpEnabled({ NODE_ENV: "production", OTP_PROVIDER: "dev" })).toBe(
      false,
    );
    expect(
      isDevOtpEnabled({
        NODE_ENV: "production",
        OTP_PROVIDER: "dev",
        [CLOSED_PILOT_OTP_ENABLED_ENV]: "true",
      }),
    ).toBe(false);
    expect(
      isDevOtpEnabled({
        NODE_ENV: "production",
        OTP_PROVIDER: "dev",
        [CLOSED_PILOT_OTP_ENABLED_ENV]: "true",
        [CLOSED_PILOT_OTP_PHONE_ALLOWLIST_ENV]: "+77000000001, bad-phone",
      }),
    ).toBe(false);
  });
});
