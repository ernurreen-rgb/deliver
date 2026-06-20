import type { RequestOtpResponse } from "@deliver/contracts/auth";
import { getClientIp } from "@/lib/http/client-ip";
import { requestLoginOtp } from "@/domains/auth/otp-service";
import { jsonError, jsonOk, readJsonObject } from "../../../_lib/responses";

export async function POST(request: Request) {
  const body = await readJsonObject(request);
  const phone = body?.phone;

  if (typeof phone !== "string") {
    return jsonError({
      status: 400,
      code: "validation_failed",
      message: "phone is required.",
      fieldErrors: { phone: "required" },
    });
  }

  const result = await requestLoginOtp({
    phone,
    clientIp: getClientIp(request.headers),
  });

  if (result.status === "failed") {
    const isRateLimited = result.error === "too_many_requests";

    return jsonError({
      status: isRateLimited ? 429 : 400,
      code: isRateLimited ? "rate_limited" : "validation_failed",
      message: "OTP request was rejected.",
      reason: result.error,
      headers: result.rateLimit
        ? { "Retry-After": String(result.rateLimit.retryAfterSeconds) }
        : undefined,
    });
  }

  return jsonOk<RequestOtpResponse>({
    expiresAt: result.expiresAt.toISOString(),
    devCode: result.devCode,
  });
}
