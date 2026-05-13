export const SESSION_COOKIE_NAME = "deliver_session";
export const DEV_OTP_CODE = "111111";
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_TTL_MINUTES = 10;
export const OTP_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
export const OTP_REQUEST_PHONE_LIMIT = 5;
export const OTP_REQUEST_IP_LIMIT = 30;
export const OTP_VERIFY_PHONE_LIMIT = 10;
export const OTP_VERIFY_IP_LIMIT = 60;
export const OTP_REQUEST_RATE_LIMIT_ERROR = "too_many_requests";
export const OTP_VERIFY_RATE_LIMIT_ERROR = "too_many_otp_attempts";
export const SESSION_TTL_DAYS = 30;

export function isDevOtpEnabled() {
  return (
    process.env.NODE_ENV !== "production" &&
    (process.env.OTP_PROVIDER ?? "dev") === "dev"
  );
}
