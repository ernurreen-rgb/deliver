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
  shouldExposeDevOtpCode,
} from "@/domains/auth/constants";
import { safeCompareHash, sha256 } from "@/domains/auth/crypto";
import { isValidPhone, normalizePhone } from "@/domains/auth/phone";
import { consumeRateLimit } from "@/lib/rate-limit";

export type RequestLoginOtpError =
  | "invalid_phone"
  | "otp_provider_unavailable"
  | "phone_not_allowed"
  | typeof OTP_REQUEST_RATE_LIMIT_ERROR;

export type VerifyLoginOtpError =
  | "invalid_code"
  | "phone_not_allowed"
  | typeof OTP_VERIFY_RATE_LIMIT_ERROR
  | "expired_code"
  | "too_many_attempts"
  | "bad_code"
  | "user_unavailable";

export type AuthRateLimitMeta = {
  retryAfterSeconds: number;
};

export type RequestLoginOtpResult =
  | {
      status: "sent";
      phone: string;
      expiresAt: Date;
      devCode?: string;
    }
  | {
      status: "failed";
      phone: string;
      error: RequestLoginOtpError;
      rateLimit?: AuthRateLimitMeta;
    };

export type VerifyLoginOtpResult =
  | {
      status: "verified";
      phone: string;
      userId: string;
    }
  | {
      status: "failed";
      phone: string;
      error: VerifyLoginOtpError;
      sent?: boolean;
      rateLimit?: AuthRateLimitMeta;
    };

export async function requestLoginOtp(input: {
  phone: string;
  clientIp: string;
}): Promise<RequestLoginOtpResult> {
  const phone = normalizePhone(input.phone);

  if (!isValidPhone(phone)) {
    return { status: "failed", phone, error: "invalid_phone" };
  }

  if (!isDevOtpEnabled()) {
    return { status: "failed", phone, error: "otp_provider_unavailable" };
  }

  if (!isDevOtpPhoneAllowed(phone)) {
    return { status: "failed", phone, error: "phone_not_allowed" };
  }

  const [phoneLimit, ipLimit] = await Promise.all([
    consumeRateLimit({
      namespace: "otp:request:phone",
      identifier: phone,
      limit: OTP_REQUEST_PHONE_LIMIT,
      windowMs: OTP_RATE_LIMIT_WINDOW_MS,
    }),
    consumeRateLimit({
      namespace: "otp:request:ip",
      identifier: input.clientIp,
      limit: OTP_REQUEST_IP_LIMIT,
      windowMs: OTP_RATE_LIMIT_WINDOW_MS,
    }),
  ]);

  if (!phoneLimit.allowed || !ipLimit.allowed) {
    return {
      status: "failed",
      phone,
      error: OTP_REQUEST_RATE_LIMIT_ERROR,
      rateLimit: {
        retryAfterSeconds: Math.max(
          phoneLimit.retryAfterSeconds,
          ipLimit.retryAfterSeconds,
        ),
      },
    };
  }

  const prisma = getPrisma();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + OTP_TTL_MINUTES * 60 * 1000);

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
        expiresAt,
      },
    }),
  ]);

  return {
    status: "sent",
    phone,
    expiresAt,
    devCode: shouldExposeDevOtpCode() ? DEV_OTP_CODE : undefined,
  };
}

export async function verifyLoginOtp(input: {
  phone: string;
  code: string;
  clientIp: string;
}): Promise<VerifyLoginOtpResult> {
  const phone = normalizePhone(input.phone);
  const code = input.code.trim();

  if (!isValidPhone(phone) || !code) {
    return { status: "failed", phone, error: "invalid_code" };
  }

  if (!isDevOtpPhoneAllowed(phone)) {
    return { status: "failed", phone, error: "phone_not_allowed" };
  }

  const [phoneLimit, ipLimit] = await Promise.all([
    consumeRateLimit({
      namespace: "otp:verify:phone",
      identifier: phone,
      limit: OTP_VERIFY_PHONE_LIMIT,
      windowMs: OTP_RATE_LIMIT_WINDOW_MS,
    }),
    consumeRateLimit({
      namespace: "otp:verify:ip",
      identifier: input.clientIp,
      limit: OTP_VERIFY_IP_LIMIT,
      windowMs: OTP_RATE_LIMIT_WINDOW_MS,
    }),
  ]);

  if (!phoneLimit.allowed || !ipLimit.allowed) {
    return {
      status: "failed",
      phone,
      error: OTP_VERIFY_RATE_LIMIT_ERROR,
      rateLimit: {
        retryAfterSeconds: Math.max(
          phoneLimit.retryAfterSeconds,
          ipLimit.retryAfterSeconds,
        ),
      },
    };
  }

  const prisma = getPrisma();
  const challenge = await prisma.authVerificationCode.findFirst({
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
    return { status: "failed", phone, error: "expired_code" };
  }

  if (challenge.attemptCount >= OTP_MAX_ATTEMPTS) {
    return { status: "failed", phone, error: "too_many_attempts" };
  }

  const isValidCode = safeCompareHash(sha256(code), challenge.codeHash);

  if (!isValidCode) {
    const attemptCount = challenge.attemptCount + 1;

    await prisma.authVerificationCode.update({
      where: { id: challenge.id },
      data: { attemptCount: { increment: 1 } },
    });

    return {
      status: "failed",
      phone,
      error:
        attemptCount >= OTP_MAX_ATTEMPTS ? "too_many_attempts" : "bad_code",
      sent: true,
    };
  }

  const user = await prisma.$transaction(async (tx) => {
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
    return { status: "failed", phone, error: "user_unavailable" };
  }

  return {
    status: "verified",
    phone,
    userId: user.id,
  };
}
