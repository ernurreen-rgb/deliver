"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSession, destroySession } from "@/domains/auth/session";
import { buildLoginPath, sanitizeAuthRedirectPath } from "@/domains/auth/redirects";
import { getClientIp } from "@/lib/http/client-ip";
import { requestLoginOtp, verifyLoginOtp } from "./otp-service";

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function requestOtpAction(formData: FormData) {
  const nextPath = sanitizeAuthRedirectPath(readString(formData, "next"));
  const requestHeaders = await headers();
  const result = await requestLoginOtp({
    phone: readString(formData, "phone"),
    clientIp: getClientIp(requestHeaders),
  });

  if (result.status === "failed") {
    redirect(
      buildLoginPath({
        error: result.error,
        nextPath,
        phone: result.phone || undefined,
      }),
    );
  }

  redirect(buildLoginPath({ nextPath, phone: result.phone, sent: true }));
}

export async function verifyOtpAction(formData: FormData) {
  const nextPath = sanitizeAuthRedirectPath(readString(formData, "next"));
  const requestHeaders = await headers();
  const result = await verifyLoginOtp({
    phone: readString(formData, "phone"),
    code: readString(formData, "code"),
    clientIp: getClientIp(requestHeaders),
  });

  if (result.status === "failed") {
    redirect(
      buildLoginPath({
        error: result.error,
        nextPath,
        phone: result.phone || undefined,
        sent: result.sent,
      }),
    );
  }

  await createSession(result.userId);

  redirect(nextPath);
}

export async function logoutAction() {
  await destroySession();
  redirect("/");
}
