import { describe, expect, it } from "vitest";
import {
  CLOSED_PILOT_OTP_ENABLED_ENV,
  CLOSED_PILOT_OTP_PHONE_ALLOWLIST_ENV,
} from "@/domains/auth/constants";
import {
  RELEASE_DATABASE_TAG_ENV,
  VERCEL_ACCOUNT_PLAN_ENV,
  RELEASE_TARGET_ENV,
  getReleaseTarget,
  isVercelHobbyCronScheduleCompatible,
  validateReleaseEnv,
} from "@/lib/release-env";

const launchDatabaseEnv = {
  DATABASE_URL:
    "postgresql://deliver:secret@ep-deliver-pooler.eu-central-1.aws.neon.tech/deliver?sslmode=require",
  PRISMA_DATABASE_URL:
    "postgresql://deliver:secret@ep-deliver.eu-central-1.aws.neon.tech/deliver?sslmode=require",
};

describe("isVercelHobbyCronScheduleCompatible", () => {
  it("accepts at-most-daily schedules and rejects sub-daily schedules", () => {
    expect(isVercelHobbyCronScheduleCompatible("0 0 * * *")).toBe(true);
    expect(isVercelHobbyCronScheduleCompatible("15 8 * * 1")).toBe(true);

    expect(isVercelHobbyCronScheduleCompatible("* * * * *")).toBe(false);
    expect(isVercelHobbyCronScheduleCompatible("0 * * * *")).toBe(false);
    expect(isVercelHobbyCronScheduleCompatible("0,30 8 * * *")).toBe(false);
    expect(isVercelHobbyCronScheduleCompatible("0 8 1 * 1")).toBe(false);
  });
});

describe("validateReleaseEnv", () => {
  it("normalizes the release target and rejects unknown targets", () => {
    expect(getReleaseTarget({})).toBe("local");
    expect(getReleaseTarget({ [RELEASE_TARGET_ENV]: "staging" })).toBe(
      "staging",
    );
    expect(getReleaseTarget({ [RELEASE_TARGET_ENV]: "production" })).toBe(
      "production",
    );
    expect(getReleaseTarget({ [RELEASE_TARGET_ENV]: "qa" })).toBeNull();

    const result = validateReleaseEnv({
      CRON_SECRET: "secret",
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/deliver",
      GEO_PROVIDER: "dev",
      OTP_PROVIDER: "dev",
      [RELEASE_TARGET_ENV]: "qa",
    });

    expect(result.ok).toBe(false);
    expect(result.checks).toContainEqual(
      expect.objectContaining({ name: RELEASE_TARGET_ENV, ok: false }),
    );
  });

  it("accepts the closed-MVP dev provider setup", () => {
    const result = validateReleaseEnv({
      CRON_SECRET: "secret",
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/deliver",
      GEO_PROVIDER: "dev",
      OTP_PROVIDER: "dev",
    });

    expect(result.ok).toBe(true);
  });

  it("accepts launch-target dev OTP only in explicit closed-pilot mode", () => {
    const result = validateReleaseEnv({
      ...launchDatabaseEnv,
      CRON_SECRET: "secret",
      GEO_PROVIDER: "dev",
      OTP_PROVIDER: "dev",
      [RELEASE_TARGET_ENV]: "production",
      [RELEASE_DATABASE_TAG_ENV]: "production",
      [VERCEL_ACCOUNT_PLAN_ENV]: "pro",
      [CLOSED_PILOT_OTP_ENABLED_ENV]: "true",
      [CLOSED_PILOT_OTP_PHONE_ALLOWLIST_ENV]: "+77000000001,+77000000002",
    });

    expect(result.ok).toBe(true);
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: CLOSED_PILOT_OTP_ENABLED_ENV, ok: true }),
        expect.objectContaining({
          name: CLOSED_PILOT_OTP_PHONE_ALLOWLIST_ENV,
          ok: true,
        }),
      ]),
    );
  });

  it("rejects launch-target dev OTP without closed-pilot safeguards", () => {
    const result = validateReleaseEnv({
      ...launchDatabaseEnv,
      CRON_SECRET: "secret",
      GEO_PROVIDER: "dev",
      OTP_PROVIDER: "dev",
      [RELEASE_TARGET_ENV]: "production",
      [RELEASE_DATABASE_TAG_ENV]: "production",
      [VERCEL_ACCOUNT_PLAN_ENV]: "pro",
    });

    expect(result.ok).toBe(false);
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: CLOSED_PILOT_OTP_ENABLED_ENV, ok: false }),
        expect.objectContaining({
          name: CLOSED_PILOT_OTP_PHONE_ALLOWLIST_ENV,
          ok: false,
        }),
      ]),
    );
  });

  it("rejects launch-target dev OTP with invalid allowlist phones", () => {
    const result = validateReleaseEnv({
      ...launchDatabaseEnv,
      CRON_SECRET: "secret",
      GEO_PROVIDER: "dev",
      OTP_PROVIDER: "dev",
      [RELEASE_TARGET_ENV]: "staging",
      [RELEASE_DATABASE_TAG_ENV]: "staging",
      [VERCEL_ACCOUNT_PLAN_ENV]: "pro",
      [CLOSED_PILOT_OTP_ENABLED_ENV]: "true",
      [CLOSED_PILOT_OTP_PHONE_ALLOWLIST_ENV]: "+77000000001,not-a-phone",
    });

    expect(result.ok).toBe(false);
    expect(result.checks).toContainEqual(
      expect.objectContaining({
        name: CLOSED_PILOT_OTP_PHONE_ALLOWLIST_ENV,
        ok: false,
      }),
    );
  });

  it("requires a Pro-compatible Vercel plan for the per-minute dispatch cron in launch targets", () => {
    const baseEnv = {
      ...launchDatabaseEnv,
      CRON_SECRET: "secret",
      GEO_PROVIDER: "dev",
      OTP_PROVIDER: "dev",
      [RELEASE_TARGET_ENV]: "production",
      [RELEASE_DATABASE_TAG_ENV]: "production",
      [CLOSED_PILOT_OTP_ENABLED_ENV]: "true",
      [CLOSED_PILOT_OTP_PHONE_ALLOWLIST_ENV]: "+77000000001",
    };

    expect(
      validateReleaseEnv({
        ...baseEnv,
        [VERCEL_ACCOUNT_PLAN_ENV]: "pro",
      }).ok,
    ).toBe(true);
    expect(
      validateReleaseEnv({
        ...baseEnv,
        [VERCEL_ACCOUNT_PLAN_ENV]: "enterprise",
      }).ok,
    ).toBe(true);

    const hobbyResult = validateReleaseEnv({
      ...baseEnv,
      [VERCEL_ACCOUNT_PLAN_ENV]: "hobby",
    });

    expect(hobbyResult.ok).toBe(false);
    expect(hobbyResult.checks).toContainEqual(
      expect.objectContaining({ name: VERCEL_ACCOUNT_PLAN_ENV, ok: false }),
    );

    const missingPlanResult = validateReleaseEnv(baseEnv);

    expect(missingPlanResult.ok).toBe(false);
    expect(missingPlanResult.checks).toContainEqual(
      expect.objectContaining({ name: VERCEL_ACCOUNT_PLAN_ENV, ok: false }),
    );
  });

  it("allows Hobby cron limits only for staging preview deployments", () => {
    const baseEnv = {
      ...launchDatabaseEnv,
      CRON_SECRET: "secret",
      GEO_PROVIDER: "dev",
      OTP_PROVIDER: "dev",
      [RELEASE_TARGET_ENV]: "staging",
      [RELEASE_DATABASE_TAG_ENV]: "staging",
      [VERCEL_ACCOUNT_PLAN_ENV]: "hobby",
      [CLOSED_PILOT_OTP_ENABLED_ENV]: "true",
      [CLOSED_PILOT_OTP_PHONE_ALLOWLIST_ENV]: "+77000000001",
    };

    expect(
      validateReleaseEnv({
        ...baseEnv,
        VERCEL_ENV: "preview",
      }).ok,
    ).toBe(true);

    const nonPreviewResult = validateReleaseEnv(baseEnv);

    expect(nonPreviewResult.ok).toBe(false);
    expect(nonPreviewResult.checks).toContainEqual(
      expect.objectContaining({ name: VERCEL_ACCOUNT_PLAN_ENV, ok: false }),
    );
  });

  it("requires the database tag to match launch release targets", () => {
    const baseEnv = {
      ...launchDatabaseEnv,
      CRON_SECRET: "secret",
      GEO_PROVIDER: "dev",
      OTP_PROVIDER: "dev",
      [RELEASE_TARGET_ENV]: "production",
      [VERCEL_ACCOUNT_PLAN_ENV]: "pro",
      [CLOSED_PILOT_OTP_ENABLED_ENV]: "true",
      [CLOSED_PILOT_OTP_PHONE_ALLOWLIST_ENV]: "+77000000001",
    };

    const missingTag = validateReleaseEnv(baseEnv);
    const mismatchedTag = validateReleaseEnv({
      ...baseEnv,
      [RELEASE_DATABASE_TAG_ENV]: "staging",
    });

    expect(missingTag.checks).toContainEqual(
      expect.objectContaining({ name: RELEASE_DATABASE_TAG_ENV, ok: false }),
    );
    expect(mismatchedTag.checks).toContainEqual(
      expect.objectContaining({ name: RELEASE_DATABASE_TAG_ENV, ok: false }),
    );
  });

  it("requires a remote runtime URL and a separate direct migration URL for launch targets", () => {
    const baseEnv = {
      CRON_SECRET: "secret",
      GEO_PROVIDER: "dev",
      OTP_PROVIDER: "dev",
      [RELEASE_TARGET_ENV]: "production",
      [RELEASE_DATABASE_TAG_ENV]: "production",
      [VERCEL_ACCOUNT_PLAN_ENV]: "pro",
      [CLOSED_PILOT_OTP_ENABLED_ENV]: "true",
      [CLOSED_PILOT_OTP_PHONE_ALLOWLIST_ENV]: "+77000000001",
    };
    const localRuntime = validateReleaseEnv({
      ...baseEnv,
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/deliver",
      PRISMA_DATABASE_URL:
        "postgresql://deliver:secret@db.example.com/deliver",
    });
    const missingDirect = validateReleaseEnv({
      ...baseEnv,
      DATABASE_URL: launchDatabaseEnv.DATABASE_URL,
    });
    const disguisedLocalRuntime = validateReleaseEnv({
      ...baseEnv,
      DATABASE_URL: "postgresql://postgres:postgres@localhost.:5432/deliver",
      PRISMA_DATABASE_URL:
        "postgresql://deliver:secret@db.example.com/deliver",
    });

    expect(localRuntime.checks).toContainEqual(
      expect.objectContaining({ name: "DATABASE_URL", ok: false }),
    );
    expect(missingDirect.checks).toContainEqual(
      expect.objectContaining({ name: "PRISMA_DATABASE_URL", ok: false }),
    );
    expect(disguisedLocalRuntime.checks).toContainEqual(
      expect.objectContaining({ name: "DATABASE_URL", ok: false }),
    );
  });

  it("enforces pooled runtime and direct migration endpoints for Neon", () => {
    const baseEnv = {
      CRON_SECRET: "secret",
      GEO_PROVIDER: "dev",
      OTP_PROVIDER: "dev",
      [RELEASE_TARGET_ENV]: "staging",
      [RELEASE_DATABASE_TAG_ENV]: "staging",
      [VERCEL_ACCOUNT_PLAN_ENV]: "pro",
      [CLOSED_PILOT_OTP_ENABLED_ENV]: "true",
      [CLOSED_PILOT_OTP_PHONE_ALLOWLIST_ENV]: "+77000000001",
    };
    const directRuntime = validateReleaseEnv({
      ...baseEnv,
      DATABASE_URL: launchDatabaseEnv.PRISMA_DATABASE_URL,
      PRISMA_DATABASE_URL: launchDatabaseEnv.PRISMA_DATABASE_URL,
    });
    const pooledMigration = validateReleaseEnv({
      ...baseEnv,
      DATABASE_URL: launchDatabaseEnv.DATABASE_URL,
      PRISMA_DATABASE_URL: launchDatabaseEnv.DATABASE_URL,
    });
    const mismatchedEndpoint = validateReleaseEnv({
      ...baseEnv,
      ...launchDatabaseEnv,
      PRISMA_DATABASE_URL:
        "postgresql://deliver:secret@ep-other.eu-central-1.aws.neon.tech/deliver?sslmode=require",
    });

    expect(directRuntime.checks).toContainEqual(
      expect.objectContaining({ name: "DATABASE_URL", ok: false }),
    );
    expect(pooledMigration.checks).toContainEqual(
      expect.objectContaining({ name: "PRISMA_DATABASE_URL", ok: false }),
    );
    expect(mismatchedEndpoint.checks).toContainEqual(
      expect.objectContaining({ name: "DATABASE_URL_PAIR", ok: false }),
    );
  });

  it("rejects unsafe pool values and URL host overrides", () => {
    const result = validateReleaseEnv({
      CRON_SECRET: "secret",
      DATABASE_URL:
        "postgresql://postgres:postgres@db.example.com/deliver?host=localhost",
      DATABASE_POOL_MAX: "0",
      GEO_PROVIDER: "dev",
      OTP_PROVIDER: "dev",
    });

    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "DATABASE_URL", ok: false }),
        expect.objectContaining({ name: "DATABASE_POOL_CONFIG", ok: false }),
      ]),
    );
  });

  it("requires 2GIS keys when the 2GIS provider is enabled", () => {
    const result = validateReleaseEnv({
      CRON_SECRET: "secret",
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/deliver",
      GEO_PROVIDER: "2gis",
      OTP_PROVIDER: "dev",
    });

    expect(result.ok).toBe(false);
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "TWOGIS_API_KEY", ok: false }),
        expect.objectContaining({
          name: "NEXT_PUBLIC_TWOGIS_MAP_KEY",
          ok: false,
        }),
      ]),
    );
  });

  it("rejects unsupported OTP providers until production OTP is implemented", () => {
    const result = validateReleaseEnv({
      CRON_SECRET: "secret",
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/deliver",
      GEO_PROVIDER: "dev",
      OTP_PROVIDER: "sms",
    });

    expect(result.ok).toBe(false);
    expect(result.checks).toContainEqual(
      expect.objectContaining({ name: "OTP_PROVIDER", ok: false }),
    );
  });

  it("requires a PostgreSQL database URL and cron secret", () => {
    const result = validateReleaseEnv({
      DATABASE_URL: "mysql://user:password@localhost:3306/deliver",
      GEO_PROVIDER: "dev",
      OTP_PROVIDER: "dev",
    });

    expect(result.ok).toBe(false);
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "DATABASE_URL", ok: false }),
        expect.objectContaining({ name: "CRON_SECRET", ok: false }),
      ]),
    );
  });
});
