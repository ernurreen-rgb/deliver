import { getCurrentUser } from "@/domains/auth/session";
import {
  checkGeoApiRateLimit,
  geoRateLimitResponse,
} from "@/domains/geo/api-rate-limit";
import { isPointInAlmaty, parseGeoPoint, reverseGeocodePoint } from "@/domains/geo";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const rateLimit = await checkGeoApiRateLimit({
    request,
    userId: user.id,
    operation: "reverse",
  });

  if (!rateLimit.allowed) {
    return geoRateLimitResponse(rateLimit);
  }

  const body = (await request.json().catch(() => null)) as {
    latitude?: string | number;
    longitude?: string | number;
  } | null;
  const point = parseGeoPoint({
    latitude: String(body?.latitude ?? ""),
    longitude: String(body?.longitude ?? ""),
  });

  if (!point || !isPointInAlmaty(point)) {
    return Response.json({ error: "point_outside_service_area" }, { status: 422 });
  }

  try {
    const result = await reverseGeocodePoint(point);

    if (!result) {
      return Response.json({ error: "reverse_geocode_failed" }, { status: 422 });
    }

    return Response.json({ result });
  } catch {
    return Response.json({ error: "geo_provider_unavailable" }, { status: 503 });
  }
}
