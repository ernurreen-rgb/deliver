"use server";

import { redirect } from "next/navigation";
import { getPrisma } from "@/lib/db/prisma";
import {
  DEV_OTP_CODE,
  OTP_TTL_MINUTES,
} from "@/domains/auth/constants";
import { safeCompareHash, sha256 } from "@/domains/auth/crypto";
import { normalizePhone, isValidPhone } from "@/domains/auth/phone";
import { createSession, destroySession } from "@/domains/auth/session";

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function requestOtpAction(formData: FormData) {
  const phone = normalizePhone(readString(formData, "phone"));

  if (!isValidPhone(phone)) {
    redirect("/login?error=invalid_phone");
  }

  await getPrisma().authVerificationCode.create({
    data: {
      phone,
      codeHash: sha256(DEV_OTP_CODE),
      purpose: "login",
      expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000),
    },
  });

  redirect(`/login?phone=${encodeURIComponent(phone)}&sent=1`);
}

export async function verifyOtpAction(formData: FormData) {
  const phone = normalizePhone(readString(formData, "phone"));
  const code = readString(formData, "code");

  if (!isValidPhone(phone) || !code) {
    redirect("/login?error=invalid_code");
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

  const isValidCode = safeCompareHash(sha256(code), challenge.codeHash);

  if (!isValidCode) {
    await getPrisma().authVerificationCode.update({
      where: { id: challenge.id },
      data: { attemptCount: { increment: 1 } },
    });

    redirect(`/login?phone=${encodeURIComponent(phone)}&sent=1&error=bad_code`);
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

  await createSession(user.id);

  redirect("/account");
}

export async function logoutAction() {
  await destroySession();
  redirect("/");
}
