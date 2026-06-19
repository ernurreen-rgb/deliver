import { describe, expect, it, vi } from "vitest";
import type { DeployedReleaseManifest } from "./lib/deployed-release-manifest";
import {
  getNpmInvocation,
  normalizeDeployedBaseUrl,
  requireExclusiveWriteApproval,
  verificationSteps,
  verifyDeployedRelease,
} from "./verify-deployed-release";

const baseEnv: NodeJS.ProcessEnv = {
  APP_BASE_URL: "https://deliver-staging.vercel.app",
  NODE_ENV: "test",
  PILOT_VIEWPORT_SCREENSHOT_DIR: ".pilot-evidence/test-staging",
  RELEASE_DATABASE_TAG: "staging",
  RELEASE_TARGET: "staging",
  SMOKE_ALLOW_PRODUCTION_WRITE: "0",
  SMOKE_ALLOW_STAGING_WRITE: "1",
};

describe("normalizeDeployedBaseUrl", () => {
  it("normalizes a valid HTTPS origin", () => {
    expect(
      normalizeDeployedBaseUrl(" https://deliver-staging.vercel.app/ "),
    ).toBe("https://deliver-staging.vercel.app");
  });

  it.each([
    "http://deliver-staging.vercel.app",
    "https://localhost",
    "https://deliver-staging.vercel.app/path",
    "https://deliver-staging.vercel.app?branch=main",
    "https://user:password@deliver-staging.vercel.app",
  ])("rejects a non-deployed origin: %s", (value) => {
    expect(() => normalizeDeployedBaseUrl(value)).toThrow();
  });
});

describe("requireExclusiveWriteApproval", () => {
  it("accepts only the write flag matching the target", () => {
    expect(() => requireExclusiveWriteApproval("staging", baseEnv)).not.toThrow();
  });

  it("rejects when both staging and production writes are enabled", () => {
    expect(() =>
      requireExclusiveWriteApproval("staging", {
        ...baseEnv,
        SMOKE_ALLOW_PRODUCTION_WRITE: "1",
      }),
    ).toThrow(/SMOKE_ALLOW_PRODUCTION_WRITE must not be enabled/);
  });
});

describe("getNpmInvocation", () => {
  it("uses cmd.exe without shell=true on Windows", () => {
    expect(
      getNpmInvocation("release:preflight-vercel", "win32", {
        ComSpec: "C:\\Windows\\System32\\cmd.exe",
        NODE_ENV: "test",
      }),
    ).toEqual({
      command: "C:\\Windows\\System32\\cmd.exe",
      args: [
        "/d",
        "/s",
        "/c",
        "npm.cmd",
        "run",
        "release:preflight-vercel",
      ],
    });
  });
});

describe("verifyDeployedRelease", () => {
  it("stops on the first failed step and writes failure evidence", async () => {
    const runStep = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("release environment failed"));
    const manifests: DeployedReleaseManifest[] = [];

    await expect(
      verifyDeployedRelease(baseEnv, {
        now: () => new Date("2026-06-20T01:00:00.000Z"),
        readExpectedVercelIdentity: async () => ({
          orgId: "team_expected",
          projectId: "prj_expected",
        }),
        runStep,
        writeManifest: async (_directory, manifest) => {
          manifests.push(manifest);
          return ".pilot-evidence/test-staging/release-manifest-failure.json";
        },
      }),
    ).rejects.toThrow("release environment failed");

    expect(runStep).toHaveBeenCalledTimes(2);
    expect(manifests).toHaveLength(1);
    expect(manifests[0]).toMatchObject({
      status: "failure",
      completedSteps: [verificationSteps[0].name],
      failedStep: verificationSteps[1].name,
    });
  });

  it("rejects conflicting write approvals before running any step", async () => {
    const runStep = vi.fn();
    const writeManifest = vi.fn();

    await expect(
      verifyDeployedRelease(
        { ...baseEnv, SMOKE_ALLOW_PRODUCTION_WRITE: "1" },
        { runStep, writeManifest },
      ),
    ).rejects.toThrow(/SMOKE_ALLOW_PRODUCTION_WRITE must not be enabled/);

    expect(runStep).not.toHaveBeenCalled();
    expect(writeManifest).not.toHaveBeenCalled();
  });

  it("runs every step in order and writes a success manifest", async () => {
    const runStep = vi.fn().mockResolvedValue(undefined);
    const manifests: DeployedReleaseManifest[] = [];

    const result = await verifyDeployedRelease(baseEnv, {
      now: () => new Date("2026-06-20T02:00:00.000Z"),
      readExpectedVercelIdentity: async () => ({
        orgId: "team_expected",
        projectId: "prj_expected",
      }),
      runStep,
      writeManifest: async (_directory, manifest) => {
        manifests.push(manifest);
        return ".pilot-evidence/test-staging/release-manifest-success.json";
      },
    });

    expect(result.ok).toBe(true);
    expect(runStep.mock.calls.map(([step]) => step)).toEqual(verificationSteps);
    expect(manifests[0]).toMatchObject({
      status: "success",
      completedSteps: verificationSteps.map((step) => step.name),
    });
  });
});
