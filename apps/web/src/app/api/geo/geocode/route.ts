import { getCurrentUser } from "@/domains/auth/session";
import {
  checkGeoApiRateLimit,
  geoRateLimitResponse,
} from "@/domains/geo/api-rate-limit";
import { geocodeAddress } from "@/domains/geo";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const rateLimit = await checkGeoApiRateLimit({
    request,
    userId: user.id,
    operation: "geocode",
  });

  if (!rateLimit.allowed) {
    return geoRateLimitResponse(rateLimit);
  }

  const body = (await request.json().catch(() => null)) as {
    city?: string;
    addressLine?: string;
    providerPlaceId?: string | null;
  } | null;
  const addressLine = body?.addressLine?.trim() ?? "";

  if (addressLine.length < 2) {
    return Response.json({ error: "address_required" }, { status: 400 });
  }

  if (addressLine.length > 240) {
    return Response.json({ error: "address_too_long" }, { status: 400 });
  }

  try {
    const result = await geocodeAddress({
      city: body?.city,
      addressLine,
      providerPlaceId: body?.providerPlaceId,
    });

    if (!result) {
      return Response.json({ error: "address_outside_service_area" }, { status: 422 });
    }

    return Response.json({ result });
  } catch {
    return Response.json({ error: "geo_provider_unavailable" }, { status: 503 });
  }
}
