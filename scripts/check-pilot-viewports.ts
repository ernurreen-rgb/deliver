import "dotenv/config";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DEV_OTP_CODE } from "@/domains/auth/constants";
import { getPrisma } from "@/lib/db/prisma";
import { getReleaseTarget } from "@/lib/release-env";
import { runSmokeCashOrder } from "./smoke-cash-order";

const ADMIN_PHONE = "+77000000001";
const CUSTOMER_PHONE = "+77000000002";
const COURIER_PHONE = "+77000000003";
const DEFAULT_CHROME_PATH =
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

type CdpMessage = {
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { message: string };
};

type Viewport = {
  name: string;
  width: number;
  height: number;
  mobile: boolean;
};

type RouteCheck = {
  name: string;
  path: string;
  expectedSurface?: string;
  expectedH1?: string;
  expectedLoadedImages?: number;
  expectedText?: string;
  phone?: string;
};

type PageMetrics = {
  clippedInteractive: string[];
  failedDemoImages: string[];
  hasHorizontalOverflow: boolean;
  h1: string | null;
  loadedDemoImages: number;
  pathname: string;
  pendingDemoImages: number;
  roleShell: string | null;
  scrollWidth: number;
  surface: string | null;
  textIncludesExpected: boolean;
  title: string;
  url: string;
  viewportWidth: number;
};

const viewports: Viewport[] = [
  { name: "desktop", width: 1440, height: 1000, mobile: false },
  { name: "mobile", width: 390, height: 844, mobile: true },
];

function normalizeBaseUrl(value: string | undefined) {
  const raw = value?.trim() || "http://localhost:3000";
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

function isLocalBaseUrl(baseUrl: string) {
  try {
    const url = new URL(baseUrl);
    const hostname = url.hostname.replace(/^\[|\]$/g, "");

    return ["localhost", "127.0.0.1", "::1"].includes(hostname);
  } catch {
    return false;
  }
}

function assertViewportTarget(baseUrl: string) {
  const releaseTarget = getReleaseTarget(process.env);

  if (!releaseTarget) {
    throw new Error(
      "RELEASE_TARGET must be one of: local, staging, production for pilot viewport checks.",
    );
  }

  if (
    releaseTarget !== "local" &&
    (!process.env.APP_BASE_URL?.trim() ||
      (isLocalBaseUrl(baseUrl) && process.env.ALLOW_LOCAL_API_CHECK !== "1"))
  ) {
    throw new Error(
      "APP_BASE_URL must explicitly point to the deployed staging/production URL for non-local pilot viewport checks.",
    );
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getChromePath() {
  return process.env.CHROME_PATH?.trim() || DEFAULT_CHROME_PATH;
}

class CdpClient {
  private nextId = 1;
  private readonly pending = new Map<
    number,
    {
      reject: (error: Error) => void;
      resolve: (value: unknown) => void;
    }
  >();
  private readonly listeners = new Map<string, Array<(params: unknown) => void>>();

  private constructor(private readonly socket: WebSocket) {
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as CdpMessage;

      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) {
          return;
        }

        this.pending.delete(message.id);

        if (message.error) {
          pending.reject(new Error(message.error.message));
          return;
        }

        pending.resolve(message.result);
        return;
      }

      if (message.method) {
        for (const listener of this.listeners.get(message.method) ?? []) {
          listener(message.params);
        }
      }
    });
  }

  static connect(webSocketDebuggerUrl: string) {
    return new Promise<CdpClient>((resolve, reject) => {
      const socket = new WebSocket(webSocketDebuggerUrl);

      socket.addEventListener("open", () => resolve(new CdpClient(socket)), {
        once: true,
      });
      socket.addEventListener("error", () => reject(new Error("CDP socket failed.")), {
        once: true,
      });
    });
  }

  close() {
    this.socket.close();
  }

  on(method: string, listener: (params: unknown) => void) {
    const listeners = this.listeners.get(method) ?? [];
    listeners.push(listener);
    this.listeners.set(method, listeners);
  }

  send<T = unknown>(method: string, params: Record<string, unknown> = {}) {
    const id = this.nextId;
    this.nextId += 1;

    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        reject,
        resolve: (value) => resolve(value as T),
      });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
}

class BrowserPage {
  readonly errors: string[] = [];

  constructor(private readonly client: CdpClient) {
    this.client.on("Runtime.exceptionThrown", (params) => {
      const details = params as {
        exceptionDetails?: {
          exception?: { description?: string };
          text?: string;
        };
      };
      this.errors.push(
        details.exceptionDetails?.exception?.description ??
          details.exceptionDetails?.text ??
          "Runtime exception",
      );
    });
    this.client.on("Runtime.consoleAPICalled", (params) => {
      const call = params as { args?: Array<{ value?: unknown }>; type?: string };
      if (call.type === "error") {
        this.errors.push(
          call.args
            ?.map((arg) => String(arg.value ?? ""))
            .join(" ")
            .trim() || "Console error",
        );
      }
    });
    this.client.on("Log.entryAdded", (params) => {
      const entry = params as { entry?: { level?: string; text?: string } };
      if (entry.entry?.level === "error") {
        this.errors.push(entry.entry.text ?? "Log error");
      }
    });
  }

  close() {
    this.client.close();
  }

  async init() {
    await this.client.send("Page.enable");
    await this.client.send("Runtime.enable");
    await this.client.send("Log.enable");
    await this.client.send("Network.enable");
  }

  async clearCookies() {
    await this.client.send("Network.clearBrowserCookies");
  }

  async setViewport(viewport: Viewport) {
    await this.client.send("Emulation.setDeviceMetricsOverride", {
      deviceScaleFactor: viewport.mobile ? 2 : 1,
      height: viewport.height,
      mobile: viewport.mobile,
      width: viewport.width,
    });
    await this.client.send("Emulation.setTouchEmulationEnabled", {
      enabled: viewport.mobile,
    });
  }

  async goto(url: string) {
    this.errors.length = 0;
    await this.client.send("Page.navigate", { url });
    await this.waitFor(
      () => this.evaluate<string>("document.readyState"),
      (readyState) => readyState === "interactive" || readyState === "complete",
      `load ${url}`,
    );
  }

  async evaluate<T>(expression: string) {
    const result = await this.client.send<{
      exceptionDetails?: { text?: string };
      result?: { value?: T };
    }>("Runtime.evaluate", {
      awaitPromise: true,
      expression,
      returnByValue: true,
    });

    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text ?? "Evaluation failed.");
    }

    return result.result?.value as T;
  }

  async waitFor<T>(
    read: () => Promise<T>,
    predicate: (value: T) => boolean,
    label: string,
    timeoutMs = 12_000,
  ) {
    const startedAt = Date.now();
    let latest: T | undefined;

    while (Date.now() - startedAt < timeoutMs) {
      latest = await read();
      if (predicate(latest)) {
        return latest;
      }

      await delay(200);
    }

    throw new Error(
      `Timed out waiting for ${label}. Latest value: ${
        typeof latest === "string"
          ? latest
          : JSON.stringify(latest)?.slice(0, 800)
      }`,
    );
  }

  async login(input: { baseUrl: string; nextPath: string; phone: string }) {
    await this.clearCookies();
    const loginUrl = `${input.baseUrl}/login?phone=${encodeURIComponent(
      input.phone,
    )}&next=${encodeURIComponent(input.nextPath)}`;

    await this.goto(loginUrl);
    await this.evaluate<boolean>(`
      (() => {
        const form = Array.from(document.forms).find((candidate) =>
          candidate.querySelector('input[name="phone"]') &&
          candidate.querySelector('input[name="next"]') &&
          !candidate.querySelector('input[name="code"]')
        );
        if (!form) return false;
        form.querySelector('input[name="phone"]').value = ${JSON.stringify(input.phone)};
        form.querySelector('input[name="next"]').value = ${JSON.stringify(input.nextPath)};
        form.requestSubmit();
        return true;
      })()
    `);
    await this.waitFor(
      () => this.evaluate<string>("location.href"),
      (href) => href.includes("sent=1") && href.includes("phone="),
      `OTP sent page for ${input.phone}`,
    );

    await this.evaluate<boolean>(`
      (() => {
        const form = Array.from(document.forms).find((candidate) =>
          candidate.querySelector('input[name="code"]')
        );
        if (!form) return false;
        form.querySelector('input[name="code"]').value = ${JSON.stringify(DEV_OTP_CODE)};
        form.querySelector('input[name="phone"]').value = ${JSON.stringify(input.phone)};
        form.querySelector('input[name="next"]').value = ${JSON.stringify(input.nextPath)};
        form.requestSubmit();
        return true;
      })()
    `);
    await this.waitFor(
      () => this.evaluate<string>("location.pathname"),
      (pathname) => pathname === input.nextPath,
      `login redirect to ${input.nextPath}`,
    );
  }

  async metrics(expectedText: string | undefined) {
    return this.evaluate<PageMetrics>(`
      (() => {
        const visibleInteractive = Array.from(
          document.querySelectorAll('a,button,input,select,textarea')
        ).filter((element) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            style.visibility !== 'hidden' &&
            style.display !== 'none'
          );
        });
        const clippedInteractive = visibleInteractive
          .filter((element) => {
            const rect = element.getBoundingClientRect();
            return rect.left < -1 || rect.right > window.innerWidth + 1;
          })
          .slice(0, 8)
          .map((element) => {
            const rect = element.getBoundingClientRect();
            const label =
              element.getAttribute('aria-label') ||
              element.textContent?.trim() ||
              element.getAttribute('href') ||
              element.getAttribute('name') ||
              element.tagName;
            return label.slice(0, 80) + ' @ ' + Math.round(rect.left) + '..' + Math.round(rect.right);
          });
        const expectedText = ${JSON.stringify(expectedText ?? "")};
        const documentWidth = Math.max(
          document.documentElement.scrollWidth,
          document.body?.scrollWidth || 0
        );
        const demoImages = Array.from(document.images).filter((image) => {
          const sources = [
            image.currentSrc,
            image.src,
            image.getAttribute('src') || '',
            image.getAttribute('srcset') || ''
          ];
          return sources.some((source) =>
            source.includes('/images/demo/') ||
            source.includes('%2Fimages%2Fdemo%2F')
          );
        });
        const loadedDemoImages = demoImages.filter((image) =>
          image.complete && image.naturalWidth > 0 && image.naturalHeight > 0
        );
        const failedDemoImages = demoImages
          .filter((image) =>
            image.complete && (image.naturalWidth === 0 || image.naturalHeight === 0)
          )
          .map((image) => image.currentSrc || image.src || image.getAttribute('src') || 'demo image');

        return {
          clippedInteractive,
          failedDemoImages,
          hasHorizontalOverflow: documentWidth > window.innerWidth + 1,
          h1: document.querySelector('h1')?.textContent?.trim() || null,
          loadedDemoImages: loadedDemoImages.length,
          pathname: location.pathname,
          pendingDemoImages: demoImages.length - loadedDemoImages.length - failedDemoImages.length,
          roleShell: document.querySelector('[data-role-shell]')?.getAttribute('data-role-shell') || null,
          scrollWidth: documentWidth,
          surface: document.querySelector('[data-surface]')?.getAttribute('data-surface') || null,
          textIncludesExpected: expectedText ? document.body.innerText.includes(expectedText) : true,
          title: document.title,
          url: location.href,
          viewportWidth: window.innerWidth
        };
      })()
    `);
  }

  async waitForPaint() {
    await this.evaluate<boolean>(`
      new Promise((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve(true));
        });
      })
    `);
  }

  async screenshot(filePath: string) {
    const result = await this.client.send<{ data: string }>(
      "Page.captureScreenshot",
      {
        captureBeyondViewport: false,
        format: "png",
      },
    );

    await writeFile(filePath, Buffer.from(result.data, "base64"));
  }
}

async function waitForDevToolsUrl(chrome: ChildProcessWithoutNullStreams) {
  let output = "";
  const pattern = /DevTools listening on (ws:\/\/[^\s]+)/;

  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Chrome did not expose a DevTools URL. Output: ${output}`));
    }, 10_000);

    const handleChunk = (chunk: Buffer) => {
      output += chunk.toString();
      const match = output.match(pattern);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    };

    chrome.stderr.on("data", handleChunk);
    chrome.stdout.on("data", handleChunk);
    chrome.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    chrome.once("exit", (code) => {
      if (code !== null && code !== 0) {
        clearTimeout(timer);
        reject(new Error(`Chrome exited early with ${code}. Output: ${output}`));
      }
    });
  });
}

async function stopChrome(chrome: ChildProcessWithoutNullStreams) {
  if (chrome.exitCode !== null) {
    return;
  }

  const exited = new Promise((resolve) => {
    chrome.once("exit", resolve);
  });

  chrome.kill();
  await Promise.race([exited, delay(3_000)]);
}

async function removeChromeUserDataDir(directory: string) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await rm(directory, { force: true, recursive: true });
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EBUSY" && code !== "EPERM") {
        throw error;
      }

      await delay(250 * (attempt + 1));
    }
  }

  console.warn(`Could not remove Chrome temp profile: ${directory}`);
}

async function openPage(devToolsUrl: string) {
  const browserEndpoint = new URL(devToolsUrl);
  const httpBase = `http://${browserEndpoint.host}`;
  const response = await fetch(`${httpBase}/json/new?about:blank`, {
    method: "PUT",
  });

  if (!response.ok) {
    throw new Error(`Could not create Chrome tab: HTTP ${response.status}`);
  }

  const target = (await response.json()) as { webSocketDebuggerUrl: string };
  const client = await CdpClient.connect(target.webSocketDebuggerUrl);
  const page = new BrowserPage(client);
  await page.init();
  return page;
}

async function main() {
  const baseUrl = normalizeBaseUrl(process.env.APP_BASE_URL);
  assertViewportTarget(baseUrl);

  const smoke = await runSmokeCashOrder();
  const orderNumber = smoke.summary.publicNumber;
  const chromeUserDataDir = await mkdtemp(path.join(tmpdir(), "deliver-chrome-"));
  const screenshotDir = process.env.PILOT_VIEWPORT_SCREENSHOT_DIR?.trim();
  const chrome = spawn(getChromePath(), [
    "--headless=new",
    "--remote-debugging-port=0",
    `--user-data-dir=${chromeUserDataDir}`,
    "--hide-scrollbars",
    "--disable-background-networking",
    "--disable-default-apps",
    "--disable-extensions",
    "--disable-popup-blocking",
    "--disable-sync",
    "--metrics-recording-only",
    "--mute-audio",
    "--no-first-run",
    "--no-default-browser-check",
    "about:blank",
  ]);

  let page: BrowserPage | undefined;

  try {
    const devToolsUrl = await waitForDevToolsUrl(chrome);
    page = await openPage(devToolsUrl);

    if (screenshotDir) {
      await mkdir(screenshotDir, { recursive: true });
    }

    const anonymousRoutes: RouteCheck[] = [
      {
        name: "login-next",
        path: `/login?next=${encodeURIComponent("/operator/pilot")}`,
        expectedH1: "Вход по телефону",
      },
    ];
    const adminRoutes: RouteCheck[] = [
      {
        name: "operator-pilot",
        path: "/operator/pilot",
        expectedH1: "Пилотный runbook",
        expectedSurface: "operator",
        expectedText: orderNumber,
      },
      {
        name: "operator",
        path: "/operator",
        expectedH1: "Панель оператора",
        expectedSurface: "operator",
        expectedText: orderNumber,
      },
      {
        name: "restaurant",
        path: "/restaurant",
        expectedH1: "Кабинет ресторана",
        expectedSurface: "restaurant",
        expectedText: "Tengri Kitchen",
      },
      {
        name: "restaurant-settings",
        path: "/restaurant/settings",
        expectedH1: "Настройки ресторана",
        expectedSurface: "restaurant",
        expectedText: "Понедельник",
      },
    ];
    const courierRoutes: RouteCheck[] = [
      {
        name: "courier",
        path: "/courier",
        expectedH1: "Кабинет курьера",
        expectedSurface: "courier",
      },
    ];
    const customerRoutes: RouteCheck[] = [
      {
        name: "customer-order",
        path: `/orders/${orderNumber}`,
        expectedText: orderNumber,
      },
      {
        name: "storefront",
        path: "/",
        expectedH1: "Рестораны рядом",
        expectedLoadedImages: 1,
        expectedText: "Tengri Kitchen",
      },
      {
        name: "restaurant-detail",
        path: "/restaurants/tengri-kitchen",
        expectedH1: "Tengri Kitchen",
        expectedLoadedImages: 1,
      },
    ];
    const checks: Array<{
      clippedInteractive: number;
      hasHorizontalOverflow: boolean;
      h1: string | null;
      loadedDemoImages: number;
      route: string;
      surface: string | null;
      viewport: string;
    }> = [];

    const verifyRoute = async (viewport: Viewport, route: RouteCheck) => {
      if (!page) {
        throw new Error("Chrome page is not initialized.");
      }

      const currentPage = page;
      const metrics = await currentPage.waitFor(
        () => currentPage.metrics(route.expectedText),
        (candidate) =>
          candidate.pathname === route.path.split("?")[0] &&
          (!route.expectedLoadedImages ||
            candidate.loadedDemoImages >= route.expectedLoadedImages) &&
          candidate.failedDemoImages.length === 0,
        `${route.name} route metrics`,
      );
      const errors = [...currentPage.errors];
      const failures = [
        metrics.hasHorizontalOverflow
          ? `horizontal overflow ${metrics.scrollWidth}/${metrics.viewportWidth}`
          : "",
        metrics.clippedInteractive.length > 0
          ? `clipped controls: ${metrics.clippedInteractive.join("; ")}`
          : "",
        route.expectedSurface && metrics.surface !== route.expectedSurface
          ? `expected surface ${route.expectedSurface}, got ${metrics.surface}`
          : "",
        route.expectedH1 && metrics.h1 !== route.expectedH1
          ? `expected h1 ${route.expectedH1}, got ${metrics.h1}`
          : "",
        !metrics.textIncludesExpected ? "missing expected text" : "",
        route.expectedLoadedImages &&
        metrics.loadedDemoImages < route.expectedLoadedImages
          ? `expected at least ${route.expectedLoadedImages} loaded demo image(s), got ${metrics.loadedDemoImages}`
          : "",
        metrics.failedDemoImages.length > 0
          ? `failed demo images: ${metrics.failedDemoImages.join("; ")}`
          : "",
        errors.length > 0 ? `browser errors: ${errors.join("; ")}` : "",
      ].filter(Boolean);

      if (screenshotDir) {
        await currentPage.waitForPaint();
        await currentPage.screenshot(
          path.join(screenshotDir, `${viewport.name}-${route.name}.png`),
        );
      }

      if (failures.length > 0) {
        throw new Error(`${viewport.name}/${route.name}: ${failures.join(" | ")}`);
      }

      checks.push({
        clippedInteractive: metrics.clippedInteractive.length,
        hasHorizontalOverflow: metrics.hasHorizontalOverflow,
        h1: metrics.h1,
        loadedDemoImages: metrics.loadedDemoImages,
        route: route.name,
        surface: metrics.surface,
        viewport: viewport.name,
      });
    };

    const visitRoute = async (viewport: Viewport, route: RouteCheck) => {
      if (!page) {
        throw new Error("Chrome page is not initialized.");
      }

      const currentPage = page;
      await currentPage.goto(`${baseUrl}${route.path}`);
      await verifyRoute(viewport, route);
    };

    for (const viewport of viewports) {
      await page.setViewport(viewport);

      for (const route of anonymousRoutes) {
        await page.clearCookies();
        await visitRoute(viewport, route);
      }

      await page.login({
        baseUrl,
        nextPath: adminRoutes[0].path,
        phone: ADMIN_PHONE,
      });
      await verifyRoute(viewport, adminRoutes[0]);
      for (const route of adminRoutes.slice(1)) {
        await visitRoute(viewport, route);
      }

      await page.login({
        baseUrl,
        nextPath: courierRoutes[0].path,
        phone: COURIER_PHONE,
      });
      for (const route of courierRoutes) {
        await verifyRoute(viewport, route);
      }

      await page.login({
        baseUrl,
        nextPath: customerRoutes[0].path,
        phone: CUSTOMER_PHONE,
      });
      await verifyRoute(viewport, customerRoutes[0]);
      for (const route of customerRoutes.slice(1)) {
        await visitRoute(viewport, route);
      }
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          baseUrl,
          checks,
          order: orderNumber,
          screenshotDir: screenshotDir || null,
        },
        null,
        2,
      ),
    );
  } finally {
    page?.close();
    await stopChrome(chrome);
    await removeChromeUserDataDir(chromeUserDataDir);
    await getPrisma().$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
