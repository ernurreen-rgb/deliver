import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/domains/auth/session";
import { suggestAddresses } from "@/domains/geo";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";

  if (query.length < 2) {
    return Response.json({ suggestions: [] });
  }

  if (query.length > 160) {
    return Response.json({ error: "query_too_long" }, { status: 400 });
  }

  try {
    const suggestions = await suggestAddresses(query);

    return Response.json({ suggestions });
  } catch {
    return Response.json({ error: "geo_provider_unavailable" }, { status: 503 });
  }
}
