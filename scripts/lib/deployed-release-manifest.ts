import { randomUUID } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ReleaseTarget } from "../../src/lib/release-env";

type LaunchReleaseTarget = Exclude<ReleaseTarget, "local">;

export type DeployedReleaseManifest = {
  schemaVersion: 1;
  status: "success" | "failure";
  timestamp: string;
  appBaseUrl: string;
  releaseTarget: LaunchReleaseTarget;
  releaseDatabaseTag: string | null;
  expectedVercelProjectId: string | null;
  expectedVercelOrgId: string | null;
  gitSha: string | null;
  gitRef: string | null;
  completedSteps: string[];
  screenshotDirectory: string;
  failedStep?: string;
  error?: string;
};

type BuildManifestInput = {
  status: DeployedReleaseManifest["status"];
  timestamp: string;
  appBaseUrl: string;
  releaseTarget: LaunchReleaseTarget;
  releaseDatabaseTag: string | undefined;
  expectedVercelProjectId: string | undefined;
  expectedVercelOrgId: string | undefined;
  env: NodeJS.ProcessEnv;
  completedSteps: string[];
  screenshotDirectory: string;
  failedStep?: string;
  error?: string;
};

function optionalValue(value: string | undefined) {
  return value?.trim() || null;
}

function firstEnvironmentValue(
  env: NodeJS.ProcessEnv,
  names: string[],
) {
  for (const name of names) {
    const value = optionalValue(env[name]);

    if (value) {
      return value;
    }
  }

  return null;
}

export function buildDeployedReleaseManifest(
  input: BuildManifestInput,
): DeployedReleaseManifest {
  const manifest: DeployedReleaseManifest = {
    schemaVersion: 1,
    status: input.status,
    timestamp: input.timestamp,
    appBaseUrl: input.appBaseUrl,
    releaseTarget: input.releaseTarget,
    releaseDatabaseTag: optionalValue(input.releaseDatabaseTag),
    expectedVercelProjectId: optionalValue(input.expectedVercelProjectId),
    expectedVercelOrgId: optionalValue(input.expectedVercelOrgId),
    gitSha: firstEnvironmentValue(input.env, [
      "VERCEL_GIT_COMMIT_SHA",
      "GITHUB_SHA",
      "CI_COMMIT_SHA",
    ]),
    gitRef: firstEnvironmentValue(input.env, [
      "VERCEL_GIT_COMMIT_REF",
      "GITHUB_REF_NAME",
      "GITHUB_REF",
      "CI_COMMIT_REF_NAME",
    ]),
    completedSteps: [...input.completedSteps],
    screenshotDirectory: input.screenshotDirectory,
  };

  if (input.status === "failure") {
    manifest.failedStep = input.failedStep || "unknown";
    manifest.error = input.error || "Unknown verification failure.";
  }

  return manifest;
}

export async function writeDeployedReleaseManifest(
  evidenceDirectory: string,
  manifest: DeployedReleaseManifest,
) {
  await mkdir(evidenceDirectory, { recursive: true });

  const filenameTimestamp = manifest.timestamp.replace(/\D/g, "");
  const filename = `release-manifest-${filenameTimestamp}-${randomUUID()}.json`;
  const manifestPath = path.join(evidenceDirectory, filename);
  const temporaryPath = path.join(
    evidenceDirectory,
    `.${filename}.${process.pid}.tmp`,
  );
  const contents = `${JSON.stringify(manifest, null, 2)}\n`;

  await writeFile(temporaryPath, contents, { encoding: "utf8", flag: "wx" });
  await rename(temporaryPath, manifestPath);

  return manifestPath;
}
