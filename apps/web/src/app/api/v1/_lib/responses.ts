import type { ApiErrorCode, ApiFailure, ApiSuccess } from "@deliver/contracts";

const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return Response.json(
    { ok: true, data } satisfies ApiSuccess<T>,
    {
      ...init,
      headers: {
        ...jsonHeaders,
        ...init?.headers,
      },
    },
  );
}

export function jsonError(input: {
  status: number;
  code: ApiErrorCode;
  message: string;
  reason?: string;
  fieldErrors?: Record<string, string>;
  headers?: HeadersInit;
}) {
  return Response.json(
    {
      ok: false,
      error: {
        code: input.code,
        message: input.message,
        reason: input.reason,
        fieldErrors: input.fieldErrors,
      },
    } satisfies ApiFailure,
    {
      status: input.status,
      headers: {
        ...jsonHeaders,
        ...input.headers,
      },
    },
  );
}

export async function readJsonObject(request: Request) {
  try {
    const body: unknown = await request.json();
    return body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
