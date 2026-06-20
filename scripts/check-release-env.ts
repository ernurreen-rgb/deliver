import "dotenv/config";
import { validateReleaseEnv } from "@/lib/release-env";

function getTargetArg() {
  const targetIndex = process.argv.findIndex((arg) => arg === "--target");
  const targetEquals = process.argv.find((arg) => arg.startsWith("--target="));

  if (targetEquals) {
    return targetEquals.slice("--target=".length);
  }

  if (targetIndex >= 0) {
    return process.argv[targetIndex + 1];
  }

  return undefined;
}

function main() {
  const target = getTargetArg();
  const env = target
    ? {
        ...process.env,
        RELEASE_TARGET: target,
      }
    : process.env;
  const result = validateReleaseEnv(env);

  console.log(JSON.stringify(result, null, 2));

  if (!result.ok) {
    process.exitCode = 1;
  }
}

main();
