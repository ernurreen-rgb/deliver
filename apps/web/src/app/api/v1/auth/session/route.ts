import type { NextRequest } from "next/server";
import type { SessionResponse } from "@deliver/contracts/auth";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME } from "@deliver/auth/constants";
import { revokeSessionToken } from "@deliver/auth/session";
import {
  getApiCurrentUser,
  getRequestSessionTokens,
} from "../../_lib/auth";
import { jsonError, jsonOk } from "../../_lib/responses";

export async function GET(request: NextRequest) {
  const user = await getApiCurrentUser(request);

  if (!user) {
    return jsonError({
      status: 401,
      code: "unauthorized",
      message: "Authentication is required.",
    });
  }

  return jsonOk<SessionResponse>({ user });
}

export async function DELETE(request: NextRequest) {
  await Promise.all(
    getRequestSessionTokens(request).map((token) => revokeSessionToken(token)),
  );

  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);

  return jsonOk({ loggedOut: true });
}
