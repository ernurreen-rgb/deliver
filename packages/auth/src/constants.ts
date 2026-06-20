import { isValidPhone, normalizePhone } from "./phone";

export const SESSION_COOKIE_NAME = "deliver_session";
export const DEV_OTP_CODE = "111111";
export const CLOSED_PILOT_OTP_ENABLED_ENV = "CLOSED_PILOT_OTP_ENABLED";
export const CLOSED_PILOT_OTP_PHONE_ALLOWLIST_ENV =
  "CLOSED_PILOT_OTP_PHONE_ALLOWLIST";
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

type AuthEnv = Record<string, string | undefined>;

const enabledValues = new Set(["1", "true", "yes", "on"]);

function isProductionEnv(env: AuthEnv) {
  return env.NODE_ENV === "production";
}

export function getOtpProvider(env: AuthEnv = process.env) {
  return env.OTP_PROVIDER?.trim() || "dev";
}

export function isClosedPilotOtpEnabled(env: AuthEnv = process.env) {
  return enabledValues.has(
    env[CLOSED_PILOT_OTP_ENABLED_ENV]?.trim().toLowerCase() ?? "",
  );
}

export function parseClosedPilotOtpPhoneAllowlist(env: AuthEnv = process.env) {
  const rawValue = env[CLOSED_PILOT_OTP_PHONE_ALLOWLIST_ENV]?.trim() ?? "";

  if (!rawValue) {
    return {
      phones: [] as string[],
      invalidEntries: [] as string[],
    };
  }

  const entries = rawValue
    .split(/[,\s]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  const phones = new Set<string>();
  const invalidEntries: string[] = [];

  for (const entry of entries) {
    const phone = normalizePhone(entry);

    if (!isValidPhone(phone)) {
      invalidEntries.push(entry);
      continue;
    }

    phones.add(phone);
  }

  return {
    phones: [...phones],
    invalidEntries,
  };
}

export function isDevOtpEnabled(env: AuthEnv = process.env) {
  if (getOtpProvider(env) !== "dev") {
    return false;
  }

  if (!isProductionEnv(env)) {
    return true;
  }

  const allowlist = parseClosedPilotOtpPhoneAllowlist(env);

  return (
    isClosedPilotOtpEnabled(env) &&
    allowlist.phones.length > 0 &&
    allowlist.invalidEntries.length === 0
  );
}

export function isDevOtpPhoneAllowed(phone: string, env: AuthEnv = process.env) {
  if (!isDevOtpEnabled(env)) {
    return false;
  }

  if (!isProductionEnv(env)) {
    return true;
  }

  return parseClosedPilotOtpPhoneAllowlist(env).phones.includes(
    normalizePhone(phone),
  );
}

export function shouldExposeDevOtpCode(env: AuthEnv = process.env) {
  return isDevOtpEnabled(env) && !isProductionEnv(env);
}
