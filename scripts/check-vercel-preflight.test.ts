import { describe, expect, it, vi } from "vitest";
import {
  deployedBaseUrlCheck,
  getVercelInvocation,
  runVercelPreflight,
} from "./check-vercel-preflight";

const baseEnv: NodeJS.ProcessEnv = {
  APP_BASE_URL: "https://deliver-staging.vercel.app",
  CI: "true",
  NODE_ENV: "test",
  RELEASE_TARGET: "staging",
  VERCEL_ORG_ID: "team_expected",
  VERCEL_PROJECT_ID: "prj_expected",
  VERCEL_TOKEN: "vercel_token_secret",
};

describe("deployedBaseUrlCheck", () => {
  it.each([
    "http://deliver-staging.vercel.app",
    "https://localhost",
    "https://user:password@deliver-staging.vercel.app",
    "https://deliver-staging.vercel.app/api",
    "https://deliver-staging.vercel.app?branch=main",
    "https://deliver-staging.vercel.app#health",
  ])("rejects an ambiguous or unsafe deployed URL: %s", (value) => {
    const result = deployedBaseUrlCheck(value);

    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain("password");
  });

  it("accepts a non-local HTTPS origin", () => {
    expect(deployedBaseUrlCheck(baseEnv.APP_BASE_URL)).toMatchObject({
      ok: true,
      details: { appBaseUrl: baseEnv.APP_BASE_URL },
    });
  });
});

describe("runVercelPreflight", () => {
  it("uses VERCEL_TOKEN for non-interactive CI authentication", async () => {
    const runVercel = vi.fn(async (args: string[]) =>
      args[0] === "--version" ? "Vercel CLI 53.0.1" : "ci-user",
    );

    const result = await runVercelPreflight({
      env: baseEnv,
      readProjectFile: async () => null,
      runVercel,
    });

    expect(result.ok).toBe(true);
    expect(runVercel).toHaveBeenNthCalledWith(2, [
      "whoami",
      "--non-interactive",
      "--no-color",
      "--token",
      baseEnv.VERCEL_TOKEN,
    ]);
    expect(JSON.stringify(result)).not.toContain(baseEnv.VERCEL_TOKEN);
  });

  it("fails closed in CI when VERCEL_TOKEN is missing", async () => {
    const runVercel = vi.fn(async () => "Vercel CLI 53.0.1");

    const result = await runVercelPreflight({
      env: { ...baseEnv, VERCEL_TOKEN: undefined },
      readProjectFile: async () => null,
      runVercel,
    });

    expect(result.ok).toBe(false);
    expect(result.checks).toContainEqual(
      expect.objectContaining({ name: "vercel_login", ok: false }),
    );
    expect(runVercel).toHaveBeenCalledTimes(1);
  });

  it("does not leak VERCEL_TOKEN when whoami fails", async () => {
    const runVercel = vi.fn(async (args: string[]) => {
      if (args[0] === "--version") {
        return "Vercel CLI 53.0.1";
      }

      throw new Error(`authentication failed for ${baseEnv.VERCEL_TOKEN}`);
    });

    const result = await runVercelPreflight({
      env: baseEnv,
      readProjectFile: async () => null,
      runVercel,
    });

    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain(baseEnv.VERCEL_TOKEN);
  });
});

describe("getVercelInvocation", () => {
  it("uses cmd.exe explicitly for .cmd execution on Windows", () => {
    expect(
      getVercelInvocation(["--version"], "win32", {
        ComSpec: "C:\\Windows\\System32\\cmd.exe",
        NODE_ENV: "test",
      }),
    ).toEqual({
      command: "C:\\Windows\\System32\\cmd.exe",
      args: ["/d", "/s", "/c", "vercel.cmd", "--version"],
    });
  });
});
