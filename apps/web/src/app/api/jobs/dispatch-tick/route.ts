import {
  isDispatchTickDryRunEnabled,
  runDispatchTick,
} from "@/domains/delivery/dispatch-job";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isAuthorized(request: Request) {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return { ok: false as const, status: 500, error: "cron_secret_not_configured" };
  }

  const authorization = request.headers.get("authorization");

  if (authorization !== `Bearer ${cronSecret}`) {
    return { ok: false as const, status: 401, error: "unauthorized" };
  }

  return { ok: true as const };
}

export async function GET(request: Request) {
  const auth = isAuthorized(request);

  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const dryRun = isDispatchTickDryRunEnabled(new URL(request.url).searchParams);
  const summary = await runDispatchTick({ dryRun });

  return Response.json({ ok: true, summary });
}
