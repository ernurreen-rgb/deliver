"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getPrisma } from "@/lib/db/prisma";
import {
  DEV_OTP_CODE,
  OTP_MAX_ATTEMPTS,
  OTP_TTL_MINUTES,
  isDevOtpEnabled,
} from "@/domains/auth/constants";
import { safeCompareHash, sha256 } from "@/domains/auth/crypto";
import { normalizePhone, isValidPhone } from "@/domains/auth/phone";
import { createSession, destroySession } from "@/domains/auth/session";
import { getClientIp } from "@/lib/http/client-ip";
import { consumeRateLimit } from "@/lib/rate-limit";

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function requestOtpAction(formData: FormData) {
  const phone = normalizePhone(readString(formData, "phone"));

  if (!isValidPhone(phone)) {
    redirect("/login?error=invalid_phone");
  }

  if (!isDevOtpEnabled()) {
    redirect("/login?error=otp_provider_unavailable");
  }

  const requestHeaders = await headers();
  const clientIp = getClientIp(requestHeaders);
  const [phoneLimit, ipLimit] = await Promise.all([
    consumeRateLimit({
      namespace: "otp:request:phone",
      identifier: phone,
      limit: 5,
      windowMs: 15 * 60 * 1000,
    }),
    consumeRateLimit({
      namespace: "otp:request:ip",
      identifier: clientIp,
      limit: 30,
      windowMs: 15 * 60 * 1000,
    }),
  ]);

  if (!phoneLimit.allowed || !ipLimit.allowed) {
    redirect(`/login?phone=${encodeURIComponent(phone)}&error=too_many_requests`);
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

  redirect(`/login?phone=${encodeURIComponent(phone)}&sent=1`);
}

export async function verifyOtpAction(formData: FormData) {
  const phone = normalizePhone(readString(formData, "phone"));
  const code = readString(formData, "code");

  if (!isValidPhone(phone) || !code) {
    redirect("/login?error=invalid_code");
  }

  const requestHeaders = await headers();
  const clientIp = getClientIp(requestHeaders);
  const [phoneLimit, ipLimit] = await Promise.all([
    consumeRateLimit({
      namespace: "otp:verify:phone",
      identifier: phone,
      limit: 10,
      windowMs: 15 * 60 * 1000,
    }),
    consumeRateLimit({
      namespace: "otp:verify:ip",
      identifier: clientIp,
      limit: 60,
      windowMs: 15 * 60 * 1000,
    }),
  ]);

  if (!phoneLimit.allowed || !ipLimit.allowed) {
    redirect(`/login?phone=${encodeURIComponent(phone)}&error=too_many_requests`);
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
    redirect(`/login?phone=${encodeURIComponent(phone)}&error=expired_code`);
  }

  if (challenge.attemptCount >= OTP_MAX_ATTEMPTS) {
    redirect(`/login?phone=${encodeURIComponent(phone)}&error=too_many_attempts`);
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

    redirect(`/login?phone=${encodeURIComponent(phone)}&sent=1&error=${error}`);
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
    redirect("/login?error=user_unavailable");
  }

  await createSession(user.id);

  redirect("/account");
}

export async function logoutAction() {
  await destroySession();
  redirect("/");
}
