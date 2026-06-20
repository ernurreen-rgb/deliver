"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getPrisma } from "@/lib/db/prisma";
import {
  DEV_OTP_CODE,
  OTP_MAX_ATTEMPTS,
  OTP_RATE_LIMIT_WINDOW_MS,
  OTP_REQUEST_IP_LIMIT,
  OTP_REQUEST_PHONE_LIMIT,
  OTP_REQUEST_RATE_LIMIT_ERROR,
  OTP_TTL_MINUTES,
  OTP_VERIFY_IP_LIMIT,
  OTP_VERIFY_PHONE_LIMIT,
  OTP_VERIFY_RATE_LIMIT_ERROR,
  isDevOtpEnabled,
  isDevOtpPhoneAllowed,
} from "@/domains/auth/constants";
import { safeCompareHash, sha256 } from "@/domains/auth/crypto";
import { normalizePhone, isValidPhone } from "@/domains/auth/phone";
import { buildLoginPath, sanitizeAuthRedirectPath } from "@/domains/auth/redirects";
import { createSession, destroySession } from "@/domains/auth/session";
import { getClientIp } from "@/lib/http/client-ip";
import { consumeRateLimit } from "@/lib/rate-limit";

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function requestOtpAction(formData: FormData) {
  const phone = normalizePhone(readString(formData, "phone"));
  const nextPath = sanitizeAuthRedirectPath(readString(formData, "next"));

  if (!isValidPhone(phone)) {
    redirect(buildLoginPath({ error: "invalid_phone", nextPath }));
  }

  if (!isDevOtpEnabled()) {
    redirect(buildLoginPath({ error: "otp_provider_unavailable", nextPath }));
  }

  if (!isDevOtpPhoneAllowed(phone)) {
    redirect(buildLoginPath({ error: "phone_not_allowed", nextPath, phone }));
  }

  const requestHeaders = await headers();
  const clientIp = getClientIp(requestHeaders);
  const [phoneLimit, ipLimit] = await Promise.all([
    consumeRateLimit({
      namespace: "otp:request:phone",
      identifier: phone,
      limit: OTP_REQUEST_PHONE_LIMIT,
      windowMs: OTP_RATE_LIMIT_WINDOW_MS,
    }),
    consumeRateLimit({
      namespace: "otp:request:ip",
      identifier: clientIp,
      limit: OTP_REQUEST_IP_LIMIT,
      windowMs: OTP_RATE_LIMIT_WINDOW_MS,
    }),
  ]);

  if (!phoneLimit.allowed || !ipLimit.allowed) {
    redirect(
      buildLoginPath({ error: OTP_REQUEST_RATE_LIMIT_ERROR, nextPath, phone }),
    );
  }

  const prisma = getPrisma();
  const now = new Date();

  await prisma.$transaction([
    prisma.authVerificationCode.updateMany({
      where: {
        phone,
        purpose: "login",
        consumedAt: null,
      },
      data: {
        consumedAt: now,
      },
    }),
    prisma.authVerificationCode.create({
      data: {
        phone,
        codeHash: sha256(DEV_OTP_CODE),
        purpose: "login",
        expiresAt: new Date(now.getTime() + OTP_TTL_MINUTES * 60 * 1000),
      },
    }),
  ]);

  redirect(buildLoginPath({ nextPath, phone, sent: true }));
}

export async function verifyOtpAction(formData: FormData) {
  const phone = normalizePhone(readString(formData, "phone"));
  const code = readString(formData, "code");
  const nextPath = sanitizeAuthRedirectPath(readString(formData, "next"));

  if (!isValidPhone(phone) || !code) {
    redirect(buildLoginPath({ error: "invalid_code", nextPath, phone }));
  }

  if (!isDevOtpPhoneAllowed(phone)) {
    redirect(buildLoginPath({ error: "phone_not_allowed", nextPath, phone }));
  }

  const requestHeaders = await headers();
  const clientIp = getClientIp(requestHeaders);
  const [phoneLimit, ipLimit] = await Promise.all([
    consumeRateLimit({
      namespace: "otp:verify:phone",
      identifier: phone,
      limit: OTP_VERIFY_PHONE_LIMIT,
      windowMs: OTP_RATE_LIMIT_WINDOW_MS,
    }),
    consumeRateLimit({
      namespace: "otp:verify:ip",
      identifier: clientIp,
      limit: OTP_VERIFY_IP_LIMIT,
      windowMs: OTP_RATE_LIMIT_WINDOW_MS,
    }),
  ]);

  if (!phoneLimit.allowed || !ipLimit.allowed) {
    redirect(
      buildLoginPath({ error: OTP_VERIFY_RATE_LIMIT_ERROR, nextPath, phone }),
    );
  }

  const challenge = await getPrisma().authVerificationCode.findFirst({
    where: {
      phone,
      purpose: "login",
      consumedAt: null,
      expiresAt: {
        gt: new Date(),
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  if (!challenge) {
    redirect(buildLoginPath({ error: "expired_code", nextPath, phone }));
  }

  if (challenge.attemptCount >= OTP_MAX_ATTEMPTS) {
    redirect(buildLoginPath({ error: "too_many_attempts", nextPath, phone }));
  }

  const isValidCode = safeCompareHash(sha256(code), challenge.codeHash);

  if (!isValidCode) {
    const attemptCount = challenge.attemptCount + 1;

    await getPrisma().authVerificationCode.update({
      where: { id: challenge.id },
      data: { attemptCount: { increment: 1 } },
    });

    const error =
      attemptCount >= OTP_MAX_ATTEMPTS ? "too_many_attempts" : "bad_code";

    redirect(buildLoginPath({ error, nextPath, phone, sent: true }));
  }

  const user = await getPrisma().$transaction(async (tx) => {
    const upsertedUser = await tx.user.upsert({
      where: { phone },
      update: {
        phoneVerifiedAt: new Date(),
      },
      create: {
        phone,
        phoneVerifiedAt: new Date(),
        roles: {
          create: [{ role: "customer" }],
        },
        preferences: {
          create: { language: "ru" },
        },
      },
    });

    await tx.userRoleAssignment.upsert({
      where: {
        userId_role: {
          userId: upsertedUser.id,
          role: "customer",
        },
      },
      update: {},
      create: {
        userId: upsertedUser.id,
        role: "customer",
      },
    });

    await tx.authVerificationCode.update({
      where: { id: challenge.id },
      data: { consumedAt: new Date() },
    });

    return upsertedUser;
  });

  if (user.status !== "active") {
    redirect(buildLoginPath({ error: "user_unavailable", nextPath }));
  }

  await createSession(user.id);

  redirect(nextPath);
}

export async function logoutAction() {
  await destroySession();
  redirect("/");
}
