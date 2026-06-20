import "dotenv/config";
import type { ApiResult } from "@deliver/contracts";
import type {
  RequestOtpResponse,
  VerifyOtpResponse,
} from "@deliver/contracts/auth";
import type { CourierDashboardResponse } from "@deliver/contracts/courier";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function getBaseUrl() {
  const baseUrl = (process.env.APP_BASE_URL?.trim() || "http://localhost:3000").replace(
    /\/$/,
    "",
  );
  const url = new URL(baseUrl);

  assert(
    LOCAL_HOSTS.has(url.hostname),
    "Courier API smoke authenticates a pilot account and only accepts a local APP_BASE_URL.",
  );

  return baseUrl;
}

async function readApiResult<T>(response: Response) {
  const result = (await response.json()) as ApiResult<T>;

  assert(
    response.ok && result.ok,
    `API request failed (${response.status}): ${
      result.ok
        ? "unexpected response"
        : `${result.error.code}/${result.error.reason ?? "unknown"}: ${result.error.message}`
    }`,
  );

  return result.data;
}

async function request<T>(baseUrl: string, path: string, init?: RequestInit) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  return readApiResult<T>(response);
}

async function main() {
  const baseUrl = getBaseUrl();
  const phone = process.env.COURIER_API_SMOKE_PHONE?.trim() || "+77000000003";
  const otp = await request<RequestOtpResponse>(baseUrl, "/api/v1/auth/otp/request", {
    method: "POST",
    body: JSON.stringify({ phone }),
  });
  const code = process.env.COURIER_API_SMOKE_OTP_CODE?.trim() || otp.devCode;

  assert(code, "Set COURIER_API_SMOKE_OTP_CODE when the dev OTP is not exposed.");

  const auth = await request<VerifyOtpResponse>(
    baseUrl,
    "/api/v1/auth/otp/verify",
    {
      method: "POST",
      body: JSON.stringify({ phone, code }),
    },
  );
  assert(auth.user.roles.includes("courier"), "Pilot account has no courier role.");

  const authorization = { Authorization: `Bearer ${auth.accessToken}` };
  const dashboard = await request<CourierDashboardResponse>(
    baseUrl,
    "/api/v1/courier/dashboard",
    { headers: authorization },
  );

  assert(dashboard.courier.phone === phone, "Courier dashboard phone mismatch.");
  assert(dashboard.courier.hasLocation, "Pilot courier location is missing.");

  await request<{ loggedOut: boolean }>(baseUrl, "/api/v1/auth/session", {
    method: "DELETE",
    headers: authorization,
  });

  const customerPhone = "+77000000002";
  const customerOtp = await request<RequestOtpResponse>(
    baseUrl,
    "/api/v1/auth/otp/request",
    {
      method: "POST",
      body: JSON.stringify({ phone: customerPhone }),
    },
  );
  const customerCode = customerOtp.devCode;
  assert(customerCode, "The local customer dev OTP is not exposed.");
  const customerAuth = await request<VerifyOtpResponse>(
    baseUrl,
    "/api/v1/auth/otp/verify",
    {
      method: "POST",
      body: JSON.stringify({ phone: customerPhone, code: customerCode }),
    },
  );
  const forbiddenResponse = await fetch(`${baseUrl}/api/v1/courier/dashboard`, {
    headers: { Authorization: `Bearer ${customerAuth.accessToken}` },
  });
  const forbiddenResult = (await forbiddenResponse.json()) as ApiResult<unknown>;
  assert(
    forbiddenResponse.status === 403 &&
      !forbiddenResult.ok &&
      forbiddenResult.error.code === "forbidden",
    "A customer token was not rejected by the courier API.",
  );
  await request<{ loggedOut: boolean }>(baseUrl, "/api/v1/auth/session", {
    method: "DELETE",
    headers: { Authorization: `Bearer ${customerAuth.accessToken}` },
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        phone,
        courierStatus: dashboard.courier.status,
        offers: dashboard.offers.length,
        deliveries: dashboard.deliveries.length,
        balance: dashboard.courier.balance,
        customerRoleRejected: true,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
