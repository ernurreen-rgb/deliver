import "dotenv/config";
import { readFileSync } from "node:fs";
import {
  getReleaseTarget,
  RELEASE_DATABASE_TAG_ENV,
  type ReleaseTarget,
} from "@/lib/release-env";

type ApiCheck = {
  details?: Record<string, unknown>;
  name: string;
  ok: boolean;
  status: number;
  message: string;
};

function normalizeBaseUrl(value: string | undefined) {
  const raw = value?.trim() || "http://localhost:3000";
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

function isLocalBaseUrl(baseUrl: string) {
  try {
    const url = new URL(baseUrl);

    return ["localhost", "127.0.0.1", "[::1]", "::1"].includes(
      url.hostname,
    );
  } catch {
    return false;
  }
}

async function readJson(response: Response) {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readExpectedVercelProjectId() {
  const envProjectId = process.env.VERCEL_PROJECT_ID?.trim();

  if (envProjectId) {
    return envProjectId;
  }

  try {
    const projectFile = JSON.parse(
      readFileSync(".vercel/project.json", "utf8"),
    ) as { projectId?: unknown };

    return typeof projectFile.projectId === "string"
      ? projectFile.projectId.trim() || null
      : null;
  } catch {
    return null;
  }
}

async function checkHealth(
  baseUrl: string,
  releaseTarget: ReleaseTarget,
  expectedDatabaseTag: string | null,
  expectedVercelProjectId: string | null,
): Promise<ApiCheck> {
  const response = await fetch(`${baseUrl}/api/health`, {
    headers: { Accept: "application/json" },
  });
  const body = await readJson(response);
  const checks = isObject(body) && isObject(body.checks) ? body.checks : null;
  const deployment =
    isObject(body) && isObject(body.deployment) ? body.deployment : null;
  const expectedHost = new URL(baseUrl).host;
  const releaseIdentityOk =
    checks?.releaseTarget === releaseTarget &&
    (expectedDatabaseTag === null ||
      checks.releaseDatabaseTag === expectedDatabaseTag);
  const deploymentIdentityOk =
    releaseTarget === "local" ||
    (deployment?.vercel === true &&
      deployment.requestHost === expectedHost &&
      (expectedVercelProjectId === null ||
        deployment.vercelProjectId === expectedVercelProjectId));
  const ok =
    response.status === 200 &&
    isObject(body) &&
    body.ok === true &&
    releaseIdentityOk &&
    deploymentIdentityOk;

  return {
    details: deployment ?? undefined,
    name: "health",
    ok,
    status: response.status,
    message: ok
      ? `/api/health is ready for ${releaseTarget}${
          expectedDatabaseTag ? ` database tag ${expectedDatabaseTag}` : ""
        }.`
      : "/api/health did not confirm the expected release, database and Vercel deployment identity.",
  };
}

async function checkCronRejectsMissingAuth(baseUrl: string): Promise<ApiCheck> {
  const response = await fetch(`${baseUrl}/api/jobs/dispatch-tick?dryRun=1`, {
    headers: { Accept: "application/json" },
  });
  const ok = response.status === 401;

  return {
    name: "cron_requires_auth",
    ok,
    status: response.status,
    message: ok
      ? "Cron endpoint rejects requests without Authorization."
      : "Cron endpoint must reject requests without Authorization.",
  };
}

async function checkCronDryRunWithAuth(
  baseUrl: string,
  cronSecret: string,
): Promise<ApiCheck> {
  const response = await fetch(`${baseUrl}/api/jobs/dispatch-tick?dryRun=1`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${cronSecret}`,
    },
  });
  const body = await readJson(response);
  const summary = isObject(body) && isObject(body.summary) ? body.summary : null;
  const ok =
    response.status === 200 &&
    isObject(body) &&
    body.ok === true &&
    isObject(summary) &&
    summary.dryRun === true;

  return {
    name: "cron_authorized_dry_run",
    ok,
    status: response.status,
    message: ok
      ? "Cron endpoint accepts the configured Authorization token in dry-run mode."
      : "Cron endpoint did not return an authorized dry-run response.",
  };
}

async function main() {
  const baseUrl = normalizeBaseUrl(process.env.APP_BASE_URL);
  const cronSecret = process.env.CRON_SECRET?.trim();
  const releaseTarget = getReleaseTarget(process.env);
  const releaseDatabaseTag =
    process.env[RELEASE_DATABASE_TAG_ENV]?.trim().toLowerCase() || null;
  const expectedVercelProjectId = readExpectedVercelProjectId();

  if (!releaseTarget) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          baseUrl,
          checks: [
            {
              name: "RELEASE_TARGET",
              ok: false,
              status: 0,
              message:
                "RELEASE_TARGET must be one of: local, staging, production.",
            },
          ],
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
    return;
  }

  if (
    releaseTarget !== "local" &&
    releaseDatabaseTag !== releaseTarget
  ) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          baseUrl,
          releaseTarget,
          checks: [
            {
              name: RELEASE_DATABASE_TAG_ENV,
              ok: false,
              status: 0,
              message: `${RELEASE_DATABASE_TAG_ENV} must match RELEASE_TARGET=${releaseTarget}.`,
            },
          ],
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
    return;
  }

  if (
    releaseTarget !== "local" &&
    (!process.env.APP_BASE_URL?.trim() ||
      (isLocalBaseUrl(baseUrl) && process.env.ALLOW_LOCAL_API_CHECK !== "1"))
  ) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          baseUrl,
          releaseTarget,
          checks: [
            {
              name: "APP_BASE_URL",
              ok: false,
              status: 0,
              message:
                "APP_BASE_URL must explicitly point to the deployed staging/production URL for non-local API checks.",
            },
          ],
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
    return;
  }

  if (!cronSecret) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          baseUrl,
          checks: [
            {
              name: "CRON_SECRET",
              ok: false,
              status: 0,
              message: "CRON_SECRET is required for release API checks.",
            },
          ],
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
    return;
  }

  const checks = [
    await checkHealth(
      baseUrl,
      releaseTarget,
      releaseDatabaseTag,
      expectedVercelProjectId,
    ),
    await checkCronRejectsMissingAuth(baseUrl),
    await checkCronDryRunWithAuth(baseUrl, cronSecret),
  ];
  const ok = checks.every((check) => check.ok);

  console.log(JSON.stringify({ ok, baseUrl, releaseTarget, checks }, null, 2));

  if (!ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
