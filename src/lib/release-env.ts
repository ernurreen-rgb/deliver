import {
  CLOSED_PILOT_OTP_ENABLED_ENV,
  CLOSED_PILOT_OTP_PHONE_ALLOWLIST_ENV,
  getOtpProvider,
  isClosedPilotOtpEnabled,
  parseClosedPilotOtpPhoneAllowlist,
} from "@/domains/auth/constants";
import { getPrismaPoolSettings } from "@/lib/db/config";
import vercelConfig from "../../vercel.json";

export type ReleaseEnv = Record<string, string | undefined>;

export const DISPATCH_CRON_PATH = "/api/jobs/dispatch-tick";
export const RELEASE_TARGET_ENV = "RELEASE_TARGET";
export const RELEASE_DATABASE_TAG_ENV = "RELEASE_DATABASE_TAG";
export const VERCEL_ACCOUNT_PLAN_ENV = "VERCEL_ACCOUNT_PLAN";

export type ReleaseTarget = "local" | "staging" | "production";

export type ReleaseEnvCheck = {
  name: string;
  ok: boolean;
  message: string;
};

export type ReleaseEnvValidation = {
  ok: boolean;
  checks: ReleaseEnvCheck[];
};

function hasValue(env: ReleaseEnv, name: string) {
  return Boolean(env[name]?.trim());
}

function normalizeReleaseTarget(value: string | undefined) {
  return value?.trim().toLowerCase();
}

export function getReleaseTarget(env: ReleaseEnv): ReleaseTarget | null {
  const target = normalizeReleaseTarget(env[RELEASE_TARGET_ENV]);

  if (!target) {
    return "local";
  }

  return ["local", "staging", "production"].includes(target)
    ? (target as ReleaseTarget)
    : null;
}

function isLaunchReleaseTarget(target: ReleaseTarget) {
  return target === "staging" || target === "production";
}

function checkReleaseTarget(env: ReleaseEnv): ReleaseEnvCheck {
  const target = getReleaseTarget(env);

  if (!target) {
    return {
      name: RELEASE_TARGET_ENV,
      ok: false,
      message: `${RELEASE_TARGET_ENV} must be one of: local, staging, production.`,
    };
  }

  return {
    name: RELEASE_TARGET_ENV,
    ok: true,
    message:
      target === "local"
        ? "Local release checks are enabled."
        : `${target} release checks are enabled.`,
  };
}

function checkReleaseDatabaseTag(
  env: ReleaseEnv,
  target: ReleaseTarget,
): ReleaseEnvCheck {
  const tag = env[RELEASE_DATABASE_TAG_ENV]?.trim().toLowerCase();

  if (!isLaunchReleaseTarget(target)) {
    return {
      name: RELEASE_DATABASE_TAG_ENV,
      ok: true,
      message:
        tag && tag !== "local"
          ? `Local release checks ignore ${RELEASE_DATABASE_TAG_ENV}=${tag}.`
          : "Local release checks do not require a database tag.",
    };
  }

  if (!tag) {
    return {
      name: RELEASE_DATABASE_TAG_ENV,
      ok: false,
      message: `${RELEASE_DATABASE_TAG_ENV}=${target} is required for ${target} release checks.`,
    };
  }

  return {
    name: RELEASE_DATABASE_TAG_ENV,
    ok: tag === target,
    message:
      tag === target
        ? `${RELEASE_DATABASE_TAG_ENV} matches ${target}.`
        : `${RELEASE_DATABASE_TAG_ENV} must match RELEASE_TARGET=${target}, got ${tag}.`,
  };
}

const PRISMA_DATABASE_URL_ENV = "PRISMA_DATABASE_URL";

type ParsedDatabaseUrl = {
  url: URL;
  databaseName: string;
  hostname: string;
  isLocal: boolean;
  isNeon: boolean;
  isNeonPooled: boolean;
  neonDirectHostname: string;
};

function normalizeHostname(hostname: string) {
  return hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.+$/, "");
}

function isLocalDatabaseHostname(hostname: string) {
  const normalized = normalizeHostname(hostname);

  return (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized === "::1" ||
    normalized === "0.0.0.0" ||
    /^127(?:\.\d{1,3}){3}$/.test(normalized)
  );
}

function parseDatabaseUrl(value: string | undefined): ParsedDatabaseUrl | null {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed);

    if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
      return null;
    }

    const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ""));
    const hasHostOverride = [...url.searchParams.keys()].some((key) =>
      ["host", "hostaddr"].includes(key.toLowerCase()),
    );

    if (!url.hostname || !url.username || !databaseName || hasHostOverride) {
      return null;
    }

    const hostname = normalizeHostname(url.hostname);
    const isNeon = hostname.endsWith(".neon.tech");
    const isNeonPooled = isNeon && /-pooler\./.test(hostname);

    return {
      url,
      databaseName,
      hostname,
      isLocal: isLocalDatabaseHostname(hostname),
      isNeon,
      isNeonPooled,
      neonDirectHostname: hostname.replace(/-pooler(?=\.)/, ""),
    };
  } catch {
    return null;
  }
}

function checkRuntimeDatabaseUrl(
  env: ReleaseEnv,
  target: ReleaseTarget,
): { check: ReleaseEnvCheck; parsed: ParsedDatabaseUrl | null } {
  const value = env.DATABASE_URL?.trim();
  const parsed = parseDatabaseUrl(value);

  if (!value) {
    return {
      parsed,
      check: {
        name: "DATABASE_URL",
        ok: false,
        message: "DATABASE_URL is required.",
      },
    };
  }

  if (!parsed) {
    return {
      parsed,
      check: {
        name: "DATABASE_URL",
        ok: false,
        message:
          "DATABASE_URL must be a PostgreSQL URL without host/hostaddr overrides.",
      },
    };
  }

  if (isLaunchReleaseTarget(target) && parsed.isLocal) {
    return {
      parsed,
      check: {
        name: "DATABASE_URL",
        ok: false,
        message: `DATABASE_URL must not use a local host for RELEASE_TARGET=${target}.`,
      },
    };
  }

  if (
    isLaunchReleaseTarget(target) &&
    parsed.isNeon &&
    !parsed.isNeonPooled
  ) {
    return {
      parsed,
      check: {
        name: "DATABASE_URL",
        ok: false,
        message:
          "DATABASE_URL must use the Neon pooled endpoint for serverless runtime.",
      },
    };
  }

  return {
    parsed,
    check: {
      name: "DATABASE_URL",
      ok: true,
      message: isLaunchReleaseTarget(target)
        ? "Remote PostgreSQL runtime connection string is configured."
        : "PostgreSQL connection string is configured.",
    },
  };
}

function checkMigrationDatabaseUrl(
  env: ReleaseEnv,
  target: ReleaseTarget,
): { check: ReleaseEnvCheck; parsed: ParsedDatabaseUrl | null } {
  const value = env[PRISMA_DATABASE_URL_ENV]?.trim();
  const parsed = parseDatabaseUrl(value);

  if (!value) {
    const required = isLaunchReleaseTarget(target);

    return {
      parsed,
      check: {
        name: PRISMA_DATABASE_URL_ENV,
        ok: !required,
        message: required
          ? `${PRISMA_DATABASE_URL_ENV} is required for direct launch migrations.`
          : `${PRISMA_DATABASE_URL_ENV} is optional for local migrations.`,
      },
    };
  }

  if (!parsed) {
    return {
      parsed,
      check: {
        name: PRISMA_DATABASE_URL_ENV,
        ok: false,
        message: `${PRISMA_DATABASE_URL_ENV} must be a PostgreSQL URL without host/hostaddr overrides.`,
      },
    };
  }

  if (isLaunchReleaseTarget(target) && parsed.isLocal) {
    return {
      parsed,
      check: {
        name: PRISMA_DATABASE_URL_ENV,
        ok: false,
        message: `${PRISMA_DATABASE_URL_ENV} must not use a local host for RELEASE_TARGET=${target}.`,
      },
    };
  }

  if (
    isLaunchReleaseTarget(target) &&
    parsed.isNeon &&
    parsed.isNeonPooled
  ) {
    return {
      parsed,
      check: {
        name: PRISMA_DATABASE_URL_ENV,
        ok: false,
        message: `${PRISMA_DATABASE_URL_ENV} must use the direct Neon endpoint for migrations.`,
      },
    };
  }

  return {
    parsed,
    check: {
      name: PRISMA_DATABASE_URL_ENV,
      ok: true,
      message: "Direct PostgreSQL migration connection string is configured.",
    },
  };
}

function checkDatabaseUrlPair(
  runtime: ParsedDatabaseUrl | null,
  migration: ParsedDatabaseUrl | null,
  target: ReleaseTarget,
): ReleaseEnvCheck {
  if (!isLaunchReleaseTarget(target)) {
    return {
      name: "DATABASE_URL_PAIR",
      ok: true,
      message: "Separate runtime and migration URLs are optional locally.",
    };
  }

  if (!runtime || !migration) {
    return {
      name: "DATABASE_URL_PAIR",
      ok: false,
      message: "Valid runtime and direct migration URLs are required.",
    };
  }

  const sameDatabase =
    runtime.databaseName.length > 0 &&
    runtime.databaseName === migration.databaseName;
  const distinctConnections = runtime.url.href !== migration.url.href;
  const bothNeonOrNeither = runtime.isNeon === migration.isNeon;
  const sameNeonEndpoint =
    !runtime.isNeon ||
    runtime.neonDirectHostname === migration.neonDirectHostname;
  const ok =
    sameDatabase &&
    distinctConnections &&
    bothNeonOrNeither &&
    sameNeonEndpoint;

  return {
    name: "DATABASE_URL_PAIR",
    ok,
    message: ok
      ? "Runtime and migration URLs are distinct and target the same database."
      : "Runtime and migration URLs must be distinct connections to the same database endpoint.",
  };
}

function checkDatabasePoolSettings(env: ReleaseEnv): ReleaseEnvCheck {
  try {
    const settings = getPrismaPoolSettings(env);

    return {
      name: "DATABASE_POOL_CONFIG",
      ok: true,
      message: `PostgreSQL pool is bounded to ${settings.max} connection(s) with a ${settings.connectionTimeoutMillis}ms connection timeout.`,
    };
  } catch (error) {
    return {
      name: "DATABASE_POOL_CONFIG",
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "PostgreSQL pool settings are invalid.",
    };
  }
}

function checkDatabaseConfiguration(
  env: ReleaseEnv,
  target: ReleaseTarget,
): ReleaseEnvCheck[] {
  const runtime = checkRuntimeDatabaseUrl(env, target);
  const migration = checkMigrationDatabaseUrl(env, target);

  return [
    runtime.check,
    migration.check,
    checkDatabaseUrlPair(runtime.parsed, migration.parsed, target),
    checkDatabasePoolSettings(env),
  ];
}

function checkCronSecret(env: ReleaseEnv): ReleaseEnvCheck {
  const ok = hasValue(env, "CRON_SECRET");

  return {
    name: "CRON_SECRET",
    ok,
    message: ok
      ? "Cron secret is configured."
      : "CRON_SECRET is required for /api/jobs/* endpoints.",
  };
}

type VercelCronConfig = {
  crons?: Array<{
    path?: string;
    schedule?: string;
  }>;
};

type VercelAccountPlan = "hobby" | "pro" | "enterprise";

function normalizeVercelAccountPlan(value: string | undefined) {
  return value?.trim().toLowerCase();
}

function isVercelPreviewEnvironment(env: ReleaseEnv) {
  return env.VERCEL_ENV?.trim().toLowerCase() === "preview";
}

function parseSingleCronNumber(input: string, min: number, max: number) {
  if (!/^\d+$/.test(input)) {
    return null;
  }

  const value = Number(input);

  return value >= min && value <= max ? value : null;
}

export function isVercelHobbyCronScheduleCompatible(schedule: string) {
  const fields = schedule.trim().split(/\s+/);

  if (fields.length !== 5) {
    return false;
  }

  const [minute, hour, dayOfMonth, , dayOfWeek] = fields;

  if (dayOfMonth !== "*" && dayOfWeek !== "*") {
    return false;
  }

  return (
    parseSingleCronNumber(minute, 0, 59) !== null &&
    parseSingleCronNumber(hour, 0, 23) !== null
  );
}

export function getDispatchCronSchedule(config: VercelCronConfig = vercelConfig) {
  return config.crons?.find((cron) => cron.path === DISPATCH_CRON_PATH)?.schedule;
}

function checkDispatchCronPlan(
  env: ReleaseEnv,
  target: ReleaseTarget,
): ReleaseEnvCheck[] {
  const schedule = getDispatchCronSchedule();

  if (!schedule) {
    return [
      {
        name: "DISPATCH_CRON",
        ok: false,
        message: `${DISPATCH_CRON_PATH} must be configured in vercel.json.`,
      },
    ];
  }

  const hobbyCompatible = isVercelHobbyCronScheduleCompatible(schedule);

  if (!isLaunchReleaseTarget(target)) {
    return [
      {
        name: "DISPATCH_CRON",
        ok: true,
        message: `${DISPATCH_CRON_PATH} is scheduled as "${schedule}". Vercel plan compatibility is enforced for staging/production release targets.`,
      },
    ];
  }

  const plan = normalizeVercelAccountPlan(env[VERCEL_ACCOUNT_PLAN_ENV]);

  if (!plan) {
    return [
      {
        name: VERCEL_ACCOUNT_PLAN_ENV,
        ok: false,
        message: `${VERCEL_ACCOUNT_PLAN_ENV}=pro or enterprise is required for production dispatch cron "${schedule}".`,
      },
    ];
  }

  if (!["hobby", "pro", "enterprise"].includes(plan)) {
    return [
      {
        name: VERCEL_ACCOUNT_PLAN_ENV,
        ok: false,
        message: `${VERCEL_ACCOUNT_PLAN_ENV} must be one of: hobby, pro, enterprise.`,
      },
    ];
  }

  const normalizedPlan = plan as VercelAccountPlan;

  if (normalizedPlan === "hobby" && !hobbyCompatible) {
    if (target === "staging" && isVercelPreviewEnvironment(env)) {
      return [
        {
          name: VERCEL_ACCOUNT_PLAN_ENV,
          ok: true,
          message: `Vercel preview deployments do not register cron jobs; production dispatch still requires Pro/Enterprise for "${schedule}".`,
        },
      ];
    }

    return [
      {
        name: VERCEL_ACCOUNT_PLAN_ENV,
        ok: false,
        message: `Vercel Hobby allows only daily cron jobs, but ${DISPATCH_CRON_PATH} is scheduled as "${schedule}". Use Pro/Enterprise for dispatch or replace Vercel cron with an external scheduler.`,
      },
    ];
  }

  return [
    {
      name: VERCEL_ACCOUNT_PLAN_ENV,
      ok: true,
      message:
        normalizedPlan === "hobby"
          ? `Vercel Hobby-compatible dispatch cron "${schedule}" is configured.`
          : `Vercel ${normalizedPlan} supports dispatch cron "${schedule}".`,
    },
  ];
}

function checkOtpProvider(
  env: ReleaseEnv,
  target: ReleaseTarget,
): ReleaseEnvCheck[] {
  const provider = getOtpProvider(env);

  if (provider !== "dev") {
    return [
      {
        name: "OTP_PROVIDER",
        ok: false,
        message: `OTP_PROVIDER=${provider} is not supported by the current MVP implementation.`,
      },
    ];
  }

  if (!isLaunchReleaseTarget(target)) {
    return [
      {
        name: "OTP_PROVIDER",
        ok: true,
        message: "OTP_PROVIDER=dev is accepted for local release checks.",
      },
    ];
  }

  const closedPilotEnabled = isClosedPilotOtpEnabled(env);
  const allowlist = parseClosedPilotOtpPhoneAllowlist(env);
  const allowlistOk =
    allowlist.phones.length > 0 && allowlist.invalidEntries.length === 0;

  return [
    {
      name: "OTP_PROVIDER",
      ok: true,
      message: "OTP_PROVIDER=dev requires closed-pilot safeguards in production.",
    },
    {
      name: CLOSED_PILOT_OTP_ENABLED_ENV,
      ok: closedPilotEnabled,
      message: closedPilotEnabled
        ? "Closed-pilot OTP mode is explicitly enabled."
        : `${CLOSED_PILOT_OTP_ENABLED_ENV}=true is required for production dev OTP.`,
    },
    {
      name: CLOSED_PILOT_OTP_PHONE_ALLOWLIST_ENV,
      ok: allowlistOk,
      message: allowlistOk
        ? `Closed-pilot OTP allowlist has ${allowlist.phones.length} phone(s).`
        : allowlist.invalidEntries.length > 0
          ? `Closed-pilot OTP allowlist has invalid phone(s): ${allowlist.invalidEntries.join(", ")}.`
          : `${CLOSED_PILOT_OTP_PHONE_ALLOWLIST_ENV} must include at least one +7 phone.`,
    },
  ];
}

function checkGeoProvider(env: ReleaseEnv): ReleaseEnvCheck[] {
  const provider = env.GEO_PROVIDER?.trim() || "dev";

  if (provider === "dev") {
    return [
      {
        name: "GEO_PROVIDER",
        ok: true,
        message: "GEO_PROVIDER=dev is configured.",
      },
    ];
  }

  if (provider !== "2gis") {
    return [
      {
        name: "GEO_PROVIDER",
        ok: false,
        message: `Unsupported GEO_PROVIDER=${provider}. Use dev or 2gis.`,
      },
    ];
  }

  const hasServerKey = hasValue(env, "TWOGIS_API_KEY");
  const hasMapKey = hasValue(env, "NEXT_PUBLIC_TWOGIS_MAP_KEY");

  return [
    {
      name: "GEO_PROVIDER",
      ok: true,
      message: "GEO_PROVIDER=2gis is configured.",
    },
    {
      name: "TWOGIS_API_KEY",
      ok: hasServerKey,
      message: hasServerKey
        ? "2GIS server API key is configured."
        : "TWOGIS_API_KEY is required when GEO_PROVIDER=2gis.",
    },
    {
      name: "NEXT_PUBLIC_TWOGIS_MAP_KEY",
      ok: hasMapKey,
      message: hasMapKey
        ? "2GIS public map key is configured."
        : "NEXT_PUBLIC_TWOGIS_MAP_KEY is required when GEO_PROVIDER=2gis.",
    },
  ];
}

export function validateReleaseEnv(env: ReleaseEnv): ReleaseEnvValidation {
  const releaseTargetCheck = checkReleaseTarget(env);
  const releaseTarget = getReleaseTarget(env);
  const target = releaseTarget ?? "local";
  const checks = [
    releaseTargetCheck,
    checkReleaseDatabaseTag(env, target),
    ...checkDatabaseConfiguration(env, target),
    checkCronSecret(env),
    ...checkDispatchCronPlan(env, target),
    ...checkOtpProvider(env, target),
    ...checkGeoProvider(env),
  ];

  return {
    ok: checks.every((check) => check.ok),
    checks,
  };
}
