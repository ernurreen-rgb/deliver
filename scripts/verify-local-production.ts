import "dotenv/config";
import { spawn, type ChildProcess } from "node:child_process";
import net from "node:net";
import path from "node:path";

const DEFAULT_PORT = 3001;
const MAX_PORT_ATTEMPTS = 50;
const LOCAL_HOSTNAME = "localhost";
const PORT_CHECK_HOSTS = ["127.0.0.1", "::1"];
const PILOT_ALLOWLIST = "+77000000001,+77000000002,+77000000003";

type CommandStep = {
  command: string;
  args: string[];
  env?: Record<string, string>;
  name: string;
};

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function nextCliPath() {
  return path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function timestamp() {
  return new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
}

async function isPortAvailable(port: number) {
  const checks = await Promise.all(
    PORT_CHECK_HOSTS.map(
      (host) =>
        new Promise<boolean>((resolve) => {
          const socket = net.createConnection({ host, port });

          socket.once("connect", () => {
            socket.destroy();
            resolve(false);
          });
          socket.once("error", () => resolve(true));
        }),
    ),
  );

  if (checks.some((available) => !available)) {
    return false;
  }

  return new Promise<boolean>((resolve) => {
    const server = net.createServer();

    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, LOCAL_HOSTNAME);
  });
}

async function findAvailablePort() {
  const requestedPort = Number(process.env.LOCAL_PROD_GATE_PORT || DEFAULT_PORT);

  if (
    !Number.isInteger(requestedPort) ||
    requestedPort <= 0 ||
    requestedPort > 65535
  ) {
    throw new Error("LOCAL_PROD_GATE_PORT must be a valid TCP port.");
  }

  for (let offset = 0; offset < MAX_PORT_ATTEMPTS; offset += 1) {
    const port = requestedPort + offset;
    if (await isPortAvailable(port)) {
      return port;
    }
  }

  throw new Error(
    `Could not find an available port from ${requestedPort} to ${
      requestedPort + MAX_PORT_ATTEMPTS - 1
    }.`,
  );
}

async function runStep(step: CommandStep) {
  console.log(`\n[local-prod] ${step.name}`);

  await new Promise<void>((resolve, reject) => {
    const child = spawnCommand(step.command, step.args, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ...step.env,
      },
      stdio: "inherit",
    });

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

function quoteWindowsArg(value: string) {
  return `"${value.replaceAll('"', '\\"')}"`;
}

function spawnCommand(
  command: string,
  args: string[],
  options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    stdio: "inherit" | ["ignore", "pipe", "pipe"];
  },
) {
  if (process.platform !== "win32") {
    return spawn(command, args, {
      ...options,
      windowsHide: true,
    });
  }

  return spawn([command, ...args.map(quoteWindowsArg)].join(" "), [], {
    ...options,
    shell: true,
    windowsHide: true,
  });
}

async function waitForHealth(
  baseUrl: string,
  server?: ChildProcess,
) {
  const deadline = Date.now() + 30_000;
  let lastError = "";
  let exitCode: number | null | undefined;
  let exitSignal: NodeJS.Signals | null | undefined;

  server?.once("exit", (code, signal) => {
    exitCode = code;
    exitSignal = signal;
  });

  while (Date.now() < deadline) {
    if (exitCode !== undefined || exitSignal !== undefined) {
      throw new Error(
        `Production server exited before readiness: code=${exitCode} signal=${exitSignal}.`,
      );
    }

    try {
      const response = await fetch(`${baseUrl}/api/health`, {
        headers: { Accept: "application/json" },
      });
      const body = (await response.json()) as { ok?: boolean };

      if (response.status === 200 && body.ok === true) {
        return;
      }

      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await delay(500);
  }

  throw new Error(`Timed out waiting for ${baseUrl}/api/health. ${lastError}`);
}

async function stopServer(server: ChildProcess) {
  if (server.exitCode !== null) {
    return;
  }

  const exited = new Promise<void>((resolve) => {
    server.once("exit", () => resolve());
  });

  if (process.platform === "win32" && server.pid) {
    spawn("taskkill", ["/PID", String(server.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    await Promise.race([exited, delay(5_000)]);
    return;
  }

  server.kill();
  await Promise.race([exited, delay(5_000)]);

  if (server.exitCode === null) {
    server.kill("SIGKILL");
  }
}

async function startProductionServer(port: number, env: Record<string, string>) {
  const child = spawn(process.execPath, [
    nextCliPath(),
    "start",
    "-p",
    String(port),
    "-H",
    LOCAL_HOSTNAME,
  ], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  child.stdout?.on("data", (chunk) => process.stdout.write(chunk));
  child.stderr?.on("data", (chunk) => process.stderr.write(chunk));

  return child;
}

async function main() {
  const npm = npmCommand();
  const port = await findAvailablePort();
  const baseUrl = `http://${LOCAL_HOSTNAME}:${port}`;
  const screenshotDir = path.join(
    ".pilot-evidence",
    `prod-local-${timestamp()}`,
  );
  const sharedEnv: Record<string, string> = {
    APP_BASE_URL: baseUrl,
    RELEASE_DATABASE_TAG: "local",
    RELEASE_TARGET: "local",
    CLOSED_PILOT_OTP_ENABLED:
      process.env.CLOSED_PILOT_OTP_ENABLED || "true",
    CLOSED_PILOT_OTP_PHONE_ALLOWLIST:
      process.env.CLOSED_PILOT_OTP_PHONE_ALLOWLIST || PILOT_ALLOWLIST,
    PILOT_VIEWPORT_SCREENSHOT_DIR: screenshotDir,
  };

  await runStep({
    command: npm,
    args: ["run", "auth:reset-local-rate-limits"],
    env: sharedEnv,
    name: "reset local OTP rate limits",
  });
  await runStep({
    command: npm,
    args: ["run", "build"],
    env: sharedEnv,
    name: "build production bundle",
  });

  console.log(`\n[local-prod] start Next.js production server on ${baseUrl}`);
  const server = await startProductionServer(port, sharedEnv);

  try {
    await waitForHealth(baseUrl, server);
    await runStep({
      command: npm,
      args: ["run", "release:check-api"],
      env: sharedEnv,
      name: "check runtime API",
    });
    await runStep({
      command: npm,
      args: ["run", "acceptance:pilot"],
      env: sharedEnv,
      name: "check role acceptance",
    });
    await runStep({
      command: npm,
      args: ["run", "acceptance:viewports"],
      env: sharedEnv,
      name: "check desktop/mobile viewports",
    });
    console.log(
      JSON.stringify(
        {
          ok: true,
          baseUrl,
          screenshotDir,
        },
        null,
        2,
      ),
    );
  } finally {
    await stopServer(server);
    await runStep({
      command: npm,
      args: ["run", "auth:reset-local-rate-limits"],
      env: sharedEnv,
      name: "reset local OTP rate limits after verification",
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
