import "dotenv/config";
import { spawn } from "node:child_process";

type GateStep = {
  name: string;
  script: string;
};

const gateSteps: GateStep[] = [
  { name: "production release env", script: "release:check-env:production" },
  { name: "architecture boundaries", script: "architecture:check" },
  { name: "lint", script: "lint" },
  { name: "unit tests", script: "test" },
  { name: "Prisma schema validation", script: "db:validate" },
  { name: "Next.js production build", script: "build" },
  { name: "Prisma migrations", script: "db:migrate:deploy" },
  { name: "cash-order smoke", script: "smoke:cash-order" },
];

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function quoteWindowsArg(value: string) {
  return `"${value.replaceAll('"', '\\"')}"`;
}

function spawnNpm(args: string[]) {
  if (process.platform !== "win32") {
    return spawn(npmCommand(), args, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        RELEASE_TARGET: "production",
      },
      stdio: "inherit",
      windowsHide: true,
    });
  }

  return spawn(
    [npmCommand(), ...args.map(quoteWindowsArg)].join(" "),
    [],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        RELEASE_TARGET: "production",
      },
      shell: true,
      stdio: "inherit",
      windowsHide: true,
    },
  );
}

async function runStep(step: GateStep) {
  console.log(`\n[release:gate] ${step.name}`);

  await new Promise<void>((resolve, reject) => {
    const child = spawnNpm(["run", step.script]);

    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${step.name} failed with exit code ${code}.`));
    });
  });
}

async function main() {
  for (const step of gateSteps) {
    await runStep(step);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
