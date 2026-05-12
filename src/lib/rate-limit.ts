import { sha256 } from "@/domains/auth/crypto";
import { getPrisma } from "@/lib/db/prisma";

type ConsumeRateLimitInput = {
  namespace: string;
  identifier: string;
  limit: number;
  windowMs: number;
  now?: Date;
};

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: Date;
  retryAfterSeconds: number;
};

function sanitizeNamespace(namespace: string) {
  return namespace.replace(/[^a-z0-9:_-]/gi, "_").slice(0, 80);
}

function getWindowResetAt(now: Date, windowMs: number) {
  const resetTime = (Math.floor(now.getTime() / windowMs) + 1) * windowMs;

  return new Date(resetTime);
}

export function createRateLimitBucketKey(input: {
  namespace: string;
  identifier: string;
  windowMs: number;
  now: Date;
}) {
  const windowIndex = Math.floor(input.now.getTime() / input.windowMs);
  const identifierHash = sha256(input.identifier || "unknown");

  return `${sanitizeNamespace(input.namespace)}:${windowIndex}:${identifierHash}`;
}

export async function consumeRateLimit(
  input: ConsumeRateLimitInput,
): Promise<RateLimitResult> {
  const now = input.now ?? new Date();
  const resetAt = getWindowResetAt(now, input.windowMs);
  const key = createRateLimitBucketKey({
    namespace: input.namespace,
    identifier: input.identifier,
    windowMs: input.windowMs,
    now,
  });
  const prisma = getPrisma();

  const [bucket] = await prisma.$transaction([
    prisma.rateLimitBucket.upsert({
      where: { key },
      create: {
        key,
        count: 1,
        expiresAt: resetAt,
      },
      update: {
        count: { increment: 1 },
        expiresAt: resetAt,
      },
      select: {
        count: true,
      },
    }),
    prisma.rateLimitBucket.deleteMany({
      where: {
        expiresAt: {
          lt: now,
        },
      },
    }),
  ]);
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((resetAt.getTime() - now.getTime()) / 1000),
  );

  return {
    allowed: bucket.count <= input.limit,
    limit: input.limit,
    remaining: Math.max(0, input.limit - bucket.count),
    resetAt,
    retryAfterSeconds,
  };
}

export function rateLimitResponse(result: RateLimitResult) {
  return Response.json(
    {
      error: "rate_limited",
      retryAfterSeconds: result.retryAfterSeconds,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(result.retryAfterSeconds),
      },
    },
  );
}
