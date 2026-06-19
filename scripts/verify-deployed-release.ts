import "dotenv/config";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  getReleaseTarget,
  RELEASE_DATABASE_TAG_ENV,
  type ReleaseTarget,
} from "../src/lib/release-env";
import {
  buildDeployedReleaseManifest,
  writeDeployedReleaseManifest,
} from "./lib/deployed-release-manifest";

export type VerificationStep = {
  name: string;
  script: string;
};

type VercelProjectFile = {
  orgId?: string;
  projectId?: string;
};

type ExpectedVercelIdentity = {
  orgId?: string;
  projectId?: string;
};

type VerificationDependencies = {
  now?: () => Date;
  readExpectedVercelIdentity?: (
    env: NodeJS.ProcessEnv,
  ) => Promise<ExpectedVercelIdentity>;
  runStep?: (step: VerificationStep, env: NodeJS.ProcessEnv) => Promise<void>;
  writeManifest?: typeof writeDeployedReleaseManifest;
};

export const verificationSteps: VerificationStep[] = [
  { name: "Vercel project preflight", script: "release:preflight-vercel" },
  { name: "release environment", script: "release:check-env" },
  { name: "deployed runtime API", script: "release:check-api" },
  { name: "pilot role acceptance", script: "acceptance:pilot" },
  { name: "desktop and mobile viewports", script: "acceptance:viewports" },
];

export function normalizeDeployedBaseUrl(value: string | undefined) {
  const raw = value?.trim();

  if (!raw) {
    throw new Error("APP_BASE_URL is required for deployed verification.");
  }

  const url = new URL(raw);

  if (url.protocol !== "https:") {
    throw new Error("APP_BASE_URL must use HTTPS for deployed verification.");
  }

  if (url.username || url.password) {
    throw new Error("APP_BASE_URL must not include credentials.");
  }

  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error(
      "APP_BASE_URL must be an origin without a path, query or fragment.",
    );
  }

  if (isLocalBaseUrl(url.origin)) {
    throw new Error("APP_BASE_URL must point to a deployed, non-local host.");
  }

  return url.origin;
}

function isLocalBaseUrl(baseUrl: string) {
  const hostname = new URL(baseUrl).hostname.replace(/^\[|\]$/g, "");

  return ["localhost", "127.0.0.1", "::1"].includes(hostname);
}

export function requireLaunchTarget(
  env: NodeJS.ProcessEnv,
): Exclude<ReleaseTarget, "local"> {
  const target = getReleaseTarget(env);

  if (target !== "staging" && target !== "production") {
    throw new Error(
      "RELEASE_TARGET must be staging or production for deployed verification.",
    );
  }

  return target;
}

export function requireMatchingDatabaseTag(
  target: Exclude<ReleaseTarget, "local">,
  env: NodeJS.ProcessEnv,
) {
  const tag = env[RELEASE_DATABASE_TAG_ENV]?.trim().toLowerCase();

  if (tag !== target) {
    throw new Error(
      `${RELEASE_DATABASE_TAG_ENV} must match RELEASE_TARGET=${target}.`,
    );
  }
}

export function requireExclusiveWriteApproval(
  target: Exclude<ReleaseTarget, "local">,
  env: NodeJS.ProcessEnv,
) {
  const requiredEnvName =
    target === "production"
      ? "SMOKE_ALLOW_PRODUCTION_WRITE"
      : "SMOKE_ALLOW_STAGING_WRITE";
  const forbiddenEnvName =
    target === "production"
      ? "SMOKE_ALLOW_STAGING_WRITE"
      : "SMOKE_ALLOW_PRODUCTION_WRITE";

  if (env[requiredEnvName] !== "1") {
    throw new Error(
      `${requiredEnvName}=1 is required because deployed acceptance creates a cash order.`,
    );
  }

  if (env[forbiddenEnvName] === "1") {
    throw new Error(
      `${forbiddenEnvName} must not be enabled while verifying RELEASE_TARGET=${target}.`,
    );
  }
}

export function getNpmInvocation(
  script: string,
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
) {
  if (platform === "win32") {
    return {
      command: env.ComSpec || "cmd.exe",
      args: ["/d", "/s", "/c", "npm.cmd", "run", script],
    };
  }

  return {
    command: "npm",
    args: ["run", script],
  };
}

function spawnNpm(script: string, env: NodeJS.ProcessEnv) {
  const invocation = getNpmInvocation(script, process.platform, env);

  return spawn(invocation.command, invocation.args, {
    cwd: process.cwd(),
    env,
    shell: false,
    stdio: "inherit",
    windowsHide: true,
  });
}

async function runStep(step: VerificationStep, env: NodeJS.ProcessEnv) {
  console.log(`\n[release:verify-deployed] ${step.name}`);

  await new Promise<void>((resolve, reject) => {
    const child = spawnNpm(step.script, env);

    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      const termination =
        code === null ? `signal ${signal || "unknown"}` : `exit code ${code}`;
      reject(new Error(`${step.name} failed with ${termination}.`));
    });
  });
}

function timestamp(date: Date) {
  return date.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function getExpectedVercelIdentity(
  env: NodeJS.ProcessEnv,
): Promise<ExpectedVercelIdentity> {
  let projectFile: VercelProjectFile | undefined;

  try {
    projectFile = JSON.parse(
      await readFile(path.join(".vercel", "project.json"), "utf8"),
    ) as VercelProjectFile;
  } catch {
    projectFile = undefined;
  }

  return {
    orgId: env.VERCEL_ORG_ID?.trim() || projectFile?.orgId,
    projectId: env.VERCEL_PROJECT_ID?.trim() || projectFile?.projectId,
  };
}

export async function verifyDeployedRelease(
  sourceEnv: NodeJS.ProcessEnv = process.env,
  dependencies: VerificationDependencies = {},
) {
  const target = requireLaunchTarget(sourceEnv);
  const baseUrl = normalizeDeployedBaseUrl(sourceEnv.APP_BASE_URL);
  requireMatchingDatabaseTag(target, sourceEnv);
  requireExclusiveWriteApproval(target, sourceEnv);

  const now = dependencies.now || (() => new Date());
  const screenshotDir =
    sourceEnv.PILOT_VIEWPORT_SCREENSHOT_DIR?.trim() ||
    path.join(".pilot-evidence", `deployed-${target}-${timestamp(now())}`);
  const env: NodeJS.ProcessEnv = {
    ...sourceEnv,
    APP_BASE_URL: baseUrl,
    PILOT_VIEWPORT_SCREENSHOT_DIR: screenshotDir,
    RELEASE_TARGET: target,
  };
  const readIdentity =
    dependencies.readExpectedVercelIdentity || getExpectedVercelIdentity;
  const expectedVercelIdentity = await readIdentity(env);
  const runVerificationStep = dependencies.runStep || runStep;
  const writeManifest =
    dependencies.writeManifest || writeDeployedReleaseManifest;
  const completedSteps: string[] = [];
  let activeStepName = "verification setup";

  try {
    for (const step of verificationSteps) {
      activeStepName = step.name;
      await runVerificationStep(step, env);
      completedSteps.push(step.name);
    }

    activeStepName = "evidence manifest write";
    const manifest = buildDeployedReleaseManifest({
      status: "success",
      timestamp: now().toISOString(),
      appBaseUrl: baseUrl,
      releaseTarget: target,
      releaseDatabaseTag: env[RELEASE_DATABASE_TAG_ENV],
      expectedVercelProjectId: expectedVercelIdentity.projectId,
      expectedVercelOrgId: expectedVercelIdentity.orgId,
      env,
      completedSteps,
      screenshotDirectory: screenshotDir,
    });
    const manifestPath = await writeManifest(screenshotDir, manifest);

    return {
      ok: true as const,
      baseUrl,
      releaseTarget: target,
      releaseDatabaseTag: env[RELEASE_DATABASE_TAG_ENV],
      screenshotDir,
      manifestPath,
    };
  } catch (error) {
    const manifest = buildDeployedReleaseManifest({
      status: "failure",
      timestamp: now().toISOString(),
      appBaseUrl: baseUrl,
      releaseTarget: target,
      releaseDatabaseTag: env[RELEASE_DATABASE_TAG_ENV],
      expectedVercelProjectId: expectedVercelIdentity.projectId,
      expectedVercelOrgId: expectedVercelIdentity.orgId,
      env,
      completedSteps,
      screenshotDirectory: screenshotDir,
      failedStep: activeStepName,
      error: errorMessage(error),
    });
    const manifestPath = await writeManifest(screenshotDir, manifest);

    console.error(`[release:verify-deployed] failure manifest: ${manifestPath}`);
    throw error;
  }
}

async function main() {
  const result = await verifyDeployedRelease();
  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
