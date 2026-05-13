import { describe, expect, it } from "vitest";
import {
  OTP_MAX_ATTEMPTS,
  OTP_RATE_LIMIT_WINDOW_MS,
  OTP_REQUEST_IP_LIMIT,
  OTP_REQUEST_PHONE_LIMIT,
  OTP_REQUEST_RATE_LIMIT_ERROR,
  OTP_VERIFY_IP_LIMIT,
  OTP_VERIFY_PHONE_LIMIT,
  OTP_VERIFY_RATE_LIMIT_ERROR,
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
});
