import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "dotenv";

const LOCAL_DATABASE_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function run(command: string, args: string[], env: NodeJS.ProcessEnv) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env,
      shell: false,
      stdio: "inherit",
      windowsHide: true,
    });

    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} exited with code ${code}.`));
    });
  });
}

async function main() {
  const envPath = path.join(process.cwd(), ".env");
  const fileEnv = parse(readFileSync(envPath));
  const databaseUrl = fileEnv.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required in .env for local development.");
  }

  const parsedDatabaseUrl = new URL(databaseUrl);
  if (!LOCAL_DATABASE_HOSTS.has(parsedDatabaseUrl.hostname)) {
    throw new Error(
      `Refusing to start local development with database host ${parsedDatabaseUrl.hostname}.`,
    );
  }

  const port = process.env.PORT || "3000";
  const localEnv: NodeJS.ProcessEnv = {
    ...process.env,
    ...fileEnv,
    APP_BASE_URL: `http://localhost:${port}`,
    DATABASE_URL: databaseUrl,
    GEO_PROVIDER: "dev",
    OTP_PROVIDER: "dev",
    PRISMA_DATABASE_URL: fileEnv.PRISMA_DATABASE_URL || databaseUrl,
    RELEASE_DATABASE_TAG: "local",
    RELEASE_TARGET: "local",
  };

  const powershell = process.env.SystemRoot
    ? path.join(process.env.SystemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
    : "powershell.exe";

  await run(
    powershell,
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      path.join(process.cwd(), "scripts", "local-postgres.ps1"),
      "start",
    ],
    localEnv,
  );

  console.log(
    `[dev:local] Next.js on http://localhost:${port}; PostgreSQL on ${parsedDatabaseUrl.hostname}:${parsedDatabaseUrl.port || "5432"}.`,
  );

  const nextProcess = spawn(
    process.execPath,
    [
      path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next"),
      "dev",
      "--hostname",
      "0.0.0.0",
      "--port",
      port,
    ],
    {
      cwd: process.cwd(),
      env: localEnv,
      shell: false,
      stdio: "inherit",
      windowsHide: true,
    },
  );

  nextProcess.once("error", (error) => {
    console.error(error);
    process.exitCode = 1;
  });
  nextProcess.once("exit", (code) => {
    process.exitCode = code ?? 1;
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
