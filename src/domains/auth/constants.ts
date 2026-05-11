export const SESSION_COOKIE_NAME = "deliver_session";
export const DEV_OTP_CODE = "111111";
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_TTL_MINUTES = 10;
export const SESSION_TTL_DAYS = 30;

export function isDevOtpEnabled() {
  return (
    process.env.NODE_ENV !== "production" &&
    (process.env.OTP_PROVIDER ?? "dev") === "dev"
  );
}
