import { describe, expect, it } from "vitest";
import { buildDeployedReleaseManifest } from "./deployed-release-manifest";

const baseInput = {
  timestamp: "2026-06-19T15:30:00.000Z",
  appBaseUrl: "https://deliver.example.com",
  releaseTarget: "staging" as const,
  releaseDatabaseTag: "staging",
  expectedVercelProjectId: "prj_expected",
  expectedVercelOrgId: "team_expected",
  completedSteps: ["release environment", "deployed runtime API"],
  screenshotDirectory: ".pilot-evidence/deployed-staging",
};

describe("buildDeployedReleaseManifest", () => {
  it("builds a successful manifest from the safe environment allowlist", () => {
    const manifest = buildDeployedReleaseManifest({
      ...baseInput,
      status: "success",
      env: {
        NODE_ENV: "test",
        DATABASE_URL: "postgresql://secret-user:secret-password@db/test",
        VERCEL_TOKEN: "secret-token",
        CRON_SECRET: "secret-cron",
        VERCEL_GIT_COMMIT_SHA: "abc123",
        VERCEL_GIT_COMMIT_REF: "release/staging",
      },
    });

    expect(manifest).toEqual({
      schemaVersion: 1,
      status: "success",
      timestamp: baseInput.timestamp,
      appBaseUrl: baseInput.appBaseUrl,
      releaseTarget: baseInput.releaseTarget,
      releaseDatabaseTag: baseInput.releaseDatabaseTag,
      expectedVercelProjectId: baseInput.expectedVercelProjectId,
      expectedVercelOrgId: baseInput.expectedVercelOrgId,
      gitSha: "abc123",
      gitRef: "release/staging",
      completedSteps: baseInput.completedSteps,
      screenshotDirectory: baseInput.screenshotDirectory,
    });
    expect(JSON.stringify(manifest)).not.toMatch(
      /secret|DATABASE_URL|VERCEL_TOKEN/,
    );
  });

  it("reports only completed steps and the failed step on failure", () => {
    const manifest = buildDeployedReleaseManifest({
      ...baseInput,
      status: "failure",
      env: {
        NODE_ENV: "test",
        GITHUB_SHA: "def456",
        GITHUB_REF_NAME: "main",
      },
      completedSteps: ["release environment"],
      failedStep: "deployed runtime API",
      error: "deployed runtime API failed with exit code 1.",
    });

    expect(manifest).toMatchObject({
      status: "failure",
      completedSteps: ["release environment"],
      failedStep: "deployed runtime API",
      error: "deployed runtime API failed with exit code 1.",
      gitSha: "def456",
      gitRef: "main",
    });
  });
});
