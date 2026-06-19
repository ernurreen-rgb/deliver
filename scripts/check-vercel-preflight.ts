import "dotenv/config";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { getReleaseTarget } from "../src/lib/release-env";

const execFileAsync = promisify(execFile);

export type PreflightCheck = {
  details?: Record<string, unknown>;
  message: string;
  name: string;
  ok: boolean;
};

type VercelProjectFile = {
  orgId?: string;
  projectId?: string;
};

type VercelPreflightOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  readProjectFile?: () => Promise<VercelProjectFile | null>;
  runVercel?: (args: string[]) => Promise<string>;
};

export type VercelPreflightResult = {
  checks: PreflightCheck[];
  ok: boolean;
};

function isLocalHostname(hostname: string) {
  return ["localhost", "127.0.0.1", "::1"].includes(
    hostname.replace(/^\[|\]$/g, ""),
  );
}

export function deployedBaseUrlCheck(value: string | undefined): PreflightCheck {
  const raw = value?.trim();

  if (!raw) {
    return {
      name: "APP_BASE_URL",
      ok: false,
      message:
        "APP_BASE_URL must explicitly point to the deployed Vercel HTTPS origin.",
    };
  }

  try {
    const url = new URL(raw);
    const originOnly =
      url.pathname === "/" && !url.search && !url.hash;
    const ok =
      url.protocol === "https:" &&
      Boolean(url.hostname) &&
      !isLocalHostname(url.hostname) &&
      !url.username &&
      !url.password &&
      originOnly;

    return {
      name: "APP_BASE_URL",
      ok,
      message: ok
        ? "APP_BASE_URL points to a deployed HTTPS origin."
        : "APP_BASE_URL must be a non-local HTTPS origin without credentials, path, query or fragment.",
      details: ok ? { appBaseUrl: url.origin } : undefined,
    };
  } catch {
    return {
      name: "APP_BASE_URL",
      ok: false,
      message: "APP_BASE_URL is not a valid URL.",
    };
  }
}

export function getVercelInvocation(
  args: string[],
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
) {
  if (platform === "win32") {
    return {
      command: env.ComSpec || "cmd.exe",
      args: ["/d", "/s", "/c", "vercel.cmd", ...args],
    };
  }

  return {
    command: "vercel",
    args,
  };
}

async function runVercelCommand(
  args: string[],
  options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    platform: NodeJS.Platform;
  },
) {
  const invocation = getVercelInvocation(args, options.platform, options.env);
  const result = await execFileAsync(invocation.command, invocation.args, {
    cwd: options.cwd,
    env: options.env,
    timeout: 15_000,
    windowsHide: true,
  });

  return result.stdout.trim();
}

async function readVercelProjectFile(cwd: string) {
  try {
    const raw = await readFile(`${cwd}/.vercel/project.json`, "utf8");
    return JSON.parse(raw) as VercelProjectFile;
  } catch {
    return null;
  }
}

export function projectIdentityCheck(
  env: NodeJS.ProcessEnv,
  projectFile: VercelProjectFile | null,
) {
  const envOrgId = env.VERCEL_ORG_ID?.trim() || null;
  const envProjectId = env.VERCEL_PROJECT_ID?.trim() || null;
  const fileOrgId = projectFile?.orgId?.trim() || null;
  const fileProjectId = projectFile?.projectId?.trim() || null;
  const orgId = envOrgId || fileOrgId;
  const projectId = envProjectId || fileProjectId;
  const mismatches = [
    envOrgId && fileOrgId && envOrgId !== fileOrgId ? "VERCEL_ORG_ID" : "",
    envProjectId && fileProjectId && envProjectId !== fileProjectId
      ? "VERCEL_PROJECT_ID"
      : "",
  ].filter(Boolean);

  if (!orgId || !projectId) {
    return {
      name: "vercel_project_identity",
      ok: false,
      message:
        "Vercel project identity is missing. Run an intentional vercel link or set VERCEL_ORG_ID and VERCEL_PROJECT_ID in CI.",
      details: {
        hasProjectFile: Boolean(projectFile),
        hasVercelOrgId: Boolean(envOrgId),
        hasVercelProjectId: Boolean(envProjectId),
      },
    } satisfies PreflightCheck;
  }

  if (mismatches.length > 0) {
    return {
      name: "vercel_project_identity",
      ok: false,
      message: `Vercel project file and environment disagree: ${mismatches.join(", ")}.`,
      details: {
        fileOrgId,
        fileProjectId,
        hasEnvOrgId: Boolean(envOrgId),
        hasEnvProjectId: Boolean(envProjectId),
      },
    } satisfies PreflightCheck;
  }

  return {
    name: "vercel_project_identity",
    ok: true,
    message: "Vercel project identity is configured.",
    details: {
      source: envOrgId || envProjectId ? "env" : ".vercel/project.json",
      orgId,
      projectId,
    },
  } satisfies PreflightCheck;
}

function isCiEnvironment(env: NodeJS.ProcessEnv) {
  const value = env.CI?.trim().toLowerCase();
  return Boolean(value && value !== "0" && value !== "false");
}

function safeCommandErrorDetails(error: unknown) {
  const candidate = error as NodeJS.ErrnoException & {
    killed?: boolean;
    signal?: NodeJS.Signals;
  };

  return {
    code: candidate?.code || null,
    killed: candidate?.killed === true,
    name: error instanceof Error ? error.name : "UnknownError",
    signal: candidate?.signal || null,
  };
}

export async function runVercelPreflight(
  options: VercelPreflightOptions = {},
): Promise<VercelPreflightResult> {
  const cwd = options.cwd || process.cwd();
  const env = options.env || process.env;
  const platform = options.platform || process.platform;
  const releaseTarget = getReleaseTarget(env);
  const checks: PreflightCheck[] = [];
  const runVercel =
    options.runVercel ||
    ((args: string[]) => runVercelCommand(args, { cwd, env, platform }));
  const readProjectFile =
    options.readProjectFile || (() => readVercelProjectFile(cwd));

  checks.push({
    name: "RELEASE_TARGET",
    ok: releaseTarget === "staging" || releaseTarget === "production",
    message:
      releaseTarget === "staging" || releaseTarget === "production"
        ? `${releaseTarget} Vercel preflight is enabled.`
        : "RELEASE_TARGET must be staging or production for Vercel preflight.",
  });
  checks.push(deployedBaseUrlCheck(env.APP_BASE_URL));

  try {
    const version = await runVercel(["--version"]);
    checks.push({
      name: "vercel_cli",
      ok: Boolean(version),
      message: version
        ? "Vercel CLI is available."
        : "Vercel CLI returned an empty version.",
      details: version ? { version } : undefined,
    });
  } catch (error) {
    checks.push({
      name: "vercel_cli",
      ok: false,
      message: "Vercel CLI is not available or not executable.",
      details: safeCommandErrorDetails(error),
    });
  }

  const token = env.VERCEL_TOKEN?.trim();

  if (isCiEnvironment(env) && !token) {
    checks.push({
      name: "vercel_login",
      ok: false,
      message:
        "VERCEL_TOKEN is required for non-interactive Vercel authentication in CI.",
    });
  } else {
    try {
      const user = await runVercel([
        "whoami",
        "--non-interactive",
        "--no-color",
        ...(token ? ["--token", token] : []),
      ]);
      checks.push({
        name: "vercel_login",
        ok: Boolean(user),
        message: user
          ? "Vercel CLI is authenticated."
          : "Vercel CLI is not authenticated.",
        details: user ? { user } : undefined,
      });
    } catch (error) {
      checks.push({
        name: "vercel_login",
        ok: false,
        message: "Vercel CLI whoami failed.",
        details: safeCommandErrorDetails(error),
      });
    }
  }

  checks.push(projectIdentityCheck(env, await readProjectFile()));

  return {
    ok: checks.every((check) => check.ok),
    checks,
  };
}

async function main() {
  const result = await runVercelPreflight();
  console.log(JSON.stringify(result, null, 2));

  if (!result.ok) {
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
