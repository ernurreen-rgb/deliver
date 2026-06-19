import { describe, expect, it } from "vitest";
import {
  DATABASE_CONNECTION_TIMEOUT_MS_ENV,
  DATABASE_IDLE_TIMEOUT_MS_ENV,
  DATABASE_POOL_MAX_ENV,
  createPrismaPgConfig,
  getPrismaPoolSettings,
} from "@/lib/db/config";

describe("Prisma pg configuration", () => {
  it("uses bounded serverless-safe pool defaults", () => {
    expect(getPrismaPoolSettings({})).toEqual({
      max: 5,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 10_000,
    });
  });

  it("accepts explicit pool settings within their safety bounds", () => {
    expect(
      getPrismaPoolSettings({
        [DATABASE_POOL_MAX_ENV]: "8",
        [DATABASE_CONNECTION_TIMEOUT_MS_ENV]: "7000",
        [DATABASE_IDLE_TIMEOUT_MS_ENV]: "30000",
      }),
    ).toEqual({
      max: 8,
      connectionTimeoutMillis: 7_000,
      idleTimeoutMillis: 30_000,
    });
  });

  it.each([
    [DATABASE_POOL_MAX_ENV, "0"],
    [DATABASE_POOL_MAX_ENV, "21"],
    [DATABASE_CONNECTION_TIMEOUT_MS_ENV, "0"],
    [DATABASE_CONNECTION_TIMEOUT_MS_ENV, "infinite"],
    [DATABASE_IDLE_TIMEOUT_MS_ENV, "60001"],
  ])("rejects unsafe %s=%s", (name, value) => {
    expect(() => getPrismaPoolSettings({ [name]: value })).toThrow(name);
  });

  it("requires and trims the runtime database URL", () => {
    expect(() => createPrismaPgConfig({})).toThrow(
      "DATABASE_URL is required",
    );

    expect(
      createPrismaPgConfig({
        DATABASE_URL: "  postgresql://app:secret@db.example/deliver  ",
      }),
    ).toMatchObject({
      connectionString: "postgresql://app:secret@db.example/deliver",
      connectionTimeoutMillis: 5_000,
    });
  });
});
