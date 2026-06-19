import { getPrisma } from "@/lib/db/prisma";
import type { NextRequest } from "next/server";
import {
  getReleaseTarget,
  RELEASE_DATABASE_TAG_ENV,
  validateReleaseEnv,
} from "@/lib/release-env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function checkDatabase() {
  try {
    await getPrisma().$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

function getDeploymentIdentity(request: NextRequest) {
  return {
    requestHost: request.nextUrl.host,
    vercel: process.env.VERCEL === "1",
    vercelProjectId: process.env.VERCEL_PROJECT_ID || null,
  };
}

export async function GET(request: NextRequest) {
  const database = await checkDatabase();
  const cronSecret = Boolean(process.env.CRON_SECRET?.trim());
  const geoProvider = process.env.GEO_PROVIDER || "dev";
  const geoProviderReady =
    geoProvider === "dev" ||
    (geoProvider === "2gis" &&
      Boolean(process.env.TWOGIS_API_KEY?.trim()) &&
      Boolean(process.env.NEXT_PUBLIC_TWOGIS_MAP_KEY?.trim()));
  const releaseEnv = validateReleaseEnv(process.env);
  const releaseTarget = getReleaseTarget(process.env) ?? "invalid";
  const releaseDatabaseTag =
    process.env[RELEASE_DATABASE_TAG_ENV]?.trim().toLowerCase() || null;
  const ok = database && cronSecret && geoProviderReady && releaseEnv.ok;

  return Response.json(
    {
      ok,
      deployment: getDeploymentIdentity(request),
      checks: {
        cronSecret,
        database,
        geoProvider,
        geoProviderReady,
        releaseEnvReady: releaseEnv.ok,
        releaseTarget,
        releaseDatabaseTag,
        releaseEnvFailedChecks: releaseEnv.checks
          .filter((check) => !check.ok)
          .map((check) => check.name),
      },
    },
    { status: ok ? 200 : 503 },
  );
}
