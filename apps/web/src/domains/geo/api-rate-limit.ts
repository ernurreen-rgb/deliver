import { getClientIp } from "@/lib/http/client-ip";
import {
  type RateLimitResult,
  consumeRateLimit,
  rateLimitResponse,
} from "@/lib/rate-limit";

const GEO_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const GEO_RATE_LIMITS = {
  suggest: {
    user: 120,
    ip: 600,
  },
  geocode: {
    user: 60,
    ip: 300,
  },
  reverse: {
    user: 60,
    ip: 300,
  },
} as const;

type GeoRateLimitOperation = keyof typeof GEO_RATE_LIMITS;

export async function checkGeoApiRateLimit(input: {
  request: Request;
  userId: string;
  operation: GeoRateLimitOperation;
}) {
  const clientIp = getClientIp(input.request.headers);
  const limits = GEO_RATE_LIMITS[input.operation];
  const [userLimit, ipLimit] = await Promise.all([
    consumeRateLimit({
      namespace: `geo:${input.operation}:user`,
      identifier: input.userId,
      limit: limits.user,
      windowMs: GEO_RATE_LIMIT_WINDOW_MS,
    }),
    consumeRateLimit({
      namespace: `geo:${input.operation}:ip`,
      identifier: clientIp,
      limit: limits.ip,
      windowMs: GEO_RATE_LIMIT_WINDOW_MS,
    }),
  ]);

  return userLimit.allowed ? ipLimit : userLimit;
}

export function geoRateLimitResponse(result: RateLimitResult) {
  return rateLimitResponse(result);
}
