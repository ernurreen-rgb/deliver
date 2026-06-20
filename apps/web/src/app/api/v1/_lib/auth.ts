import type { NextRequest } from "next/server";
import type { AuthUser } from "@deliver/contracts/auth";
import type { Locale, UserRole } from "@deliver/contracts/domain";
import { SESSION_COOKIE_NAME } from "@deliver/auth/constants";
import { getUserBySessionToken } from "@deliver/auth/session";
import { getPrisma } from "@deliver/database";
import { jsonError } from "./responses";

function readBearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization")?.trim();

  if (!authorization) {
    return null;
  }

  const [scheme, token] = authorization.split(/\s+/, 2);

  return scheme?.toLowerCase() === "bearer" && token ? token : null;
}

export function getRequestSessionToken(request: NextRequest) {
  return readBearerToken(request) ?? request.cookies.get(SESSION_COOKIE_NAME)?.value;
}

export function getRequestSessionTokens(request: NextRequest) {
  return Array.from(
    new Set(
      [
        readBearerToken(request),
        request.cookies.get(SESSION_COOKIE_NAME)?.value,
      ].filter((token): token is string => Boolean(token)),
    ),
  );
}

function toApiUser(user: {
  id: string;
  phone: string;
  name: string | null;
  preferences: { language: Locale } | null;
  roles: { role: UserRole }[];
}): AuthUser {
  return {
    id: user.id,
    phone: user.phone,
    name: user.name,
    locale: user.preferences?.language ?? "ru",
    roles: user.roles.map((role) => role.role),
  };
}

export async function getApiAuthUserById(userId: string) {
  const user = await getPrisma().user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      phone: true,
      name: true,
      status: true,
      preferences: {
        select: {
          language: true,
        },
      },
      roles: {
        select: {
          role: true,
        },
      },
    },
  });

  return user?.status === "active" ? toApiUser(user) : null;
}

export async function getApiCurrentUser(request: NextRequest) {
  const sessionUser = await getUserBySessionToken(getRequestSessionToken(request));

  if (!sessionUser) {
    return null;
  }

  return getApiAuthUserById(sessionUser.id);
}

export async function requireApiCustomer(request: NextRequest) {
  const user = await getApiCurrentUser(request);

  if (!user) {
    return {
      response: jsonError({
        status: 401,
        code: "unauthorized",
        message: "Authentication is required.",
      }),
    } as const;
  }

  if (!user.roles.includes("customer")) {
    return {
      response: jsonError({
        status: 403,
        code: "forbidden",
        message: "Customer role is required.",
      }),
    } as const;
  }

  return { user } as const;
}

export async function requireApiCourier(request: NextRequest) {
  const user = await getApiCurrentUser(request);

  if (!user) {
    return {
      response: jsonError({
        status: 401,
        code: "unauthorized",
        message: "Authentication is required.",
      }),
    } as const;
  }

  if (!user.roles.some((role) => role === "courier" || role === "admin")) {
    return {
      response: jsonError({
        status: 403,
        code: "forbidden",
        message: "Courier role is required.",
      }),
    } as const;
  }

  return { user } as const;
}
