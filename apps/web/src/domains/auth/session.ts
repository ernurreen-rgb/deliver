import { cache } from "react";
import { cookies } from "next/headers";
import { getPrisma } from "@/lib/db/prisma";
import {
  SESSION_COOKIE_NAME,
  SESSION_TTL_DAYS,
} from "@/domains/auth/constants";
import { createSessionToken, sha256 } from "@/domains/auth/crypto";

export async function createSession(userId: string) {
  const prisma = getPrisma();
  const token = createSessionToken();
  const tokenHash = sha256(token);
  const expiresAt = new Date(
    Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
  );

  await prisma.userSession.create({
    data: {
      userId,
      sessionTokenHash: tokenHash,
      expiresAt,
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    await getPrisma().userSession.updateMany({
      where: {
        sessionTokenHash: sha256(token),
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  cookieStore.delete(SESSION_COOKIE_NAME);
}

export const getCurrentUser = cache(async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  const session = await getPrisma().userSession.findUnique({
    where: {
      sessionTokenHash: sha256(token),
    },
    select: {
      revokedAt: true,
      expiresAt: true,
      user: {
        select: {
          id: true,
          phone: true,
          name: true,
          status: true,
          roles: {
            select: {
              role: true,
            },
          },
        },
      },
    },
  });

  if (
    !session ||
    session.revokedAt ||
    session.expiresAt < new Date() ||
    session.user.status !== "active"
  ) {
    return null;
  }

  return session.user;
});
