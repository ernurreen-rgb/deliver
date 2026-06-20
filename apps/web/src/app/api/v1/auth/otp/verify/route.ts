import type { VerifyOtpResponse } from "@deliver/contracts/auth";
import { createSession } from "@deliver/auth/session";
import { getClientIp } from "@/lib/http/client-ip";
import { verifyLoginOtp } from "@/domains/auth/otp-service";
import { getApiAuthUserById } from "../../../_lib/auth";
import { jsonError, jsonOk, readJsonObject } from "../../../_lib/responses";

export async function POST(request: Request) {
  const body = await readJsonObject(request);
  const phone = body?.phone;
  const code = body?.code;
  const fieldErrors: Record<string, string> = {};

  const hasPhone = typeof phone === "string";
  const hasCode = typeof code === "string";

  if (!hasPhone) {
    fieldErrors.phone = "required";
  }

  if (!hasCode) {
    fieldErrors.code = "required";
  }

  if (!hasPhone || !hasCode) {
    return jsonError({
      status: 400,
      code: "validation_failed",
      message: "phone and code are required.",
      fieldErrors,
    });
  }

  const result = await verifyLoginOtp({
    phone,
    code,
    clientIp: getClientIp(request.headers),
  });

  if (result.status === "failed") {
    const isRateLimited = result.error === "too_many_otp_attempts";

    return jsonError({
      status: isRateLimited ? 429 : 400,
      code: isRateLimited ? "rate_limited" : "validation_failed",
      message: "OTP verification failed.",
      reason: result.error,
      headers: result.rateLimit
        ? { "Retry-After": String(result.rateLimit.retryAfterSeconds) }
        : undefined,
    });
  }

  const session = await createSession(result.userId);
  const user = await getApiAuthUserById(result.userId);

  if (!user) {
    return jsonError({
      status: 401,
      code: "unauthorized",
      message: "User is unavailable.",
    });
  }

  return jsonOk<VerifyOtpResponse>({
    accessToken: session.token,
    expiresAt: session.expiresAt.toISOString(),
    user,
  });
}
