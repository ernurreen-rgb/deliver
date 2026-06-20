import "dotenv/config";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const DEFAULT_CHROME_PATH =
  process.platform === "win32"
    ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
    : undefined;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function getBaseUrl() {
  const baseUrl = (process.env.APP_BASE_URL?.trim() || "http://localhost:3000").replace(
    /\/$/,
    "",
  );
  const url = new URL(baseUrl);

  assert(
    LOCAL_HOSTS.has(url.hostname),
    "Customer web acceptance creates a real order and only accepts a local APP_BASE_URL.",
  );

  return baseUrl;
}

async function main() {
  const baseUrl = getBaseUrl();
  const healthResponse = await fetch(`${baseUrl}/api/health`, {
    headers: { Accept: "application/json" },
  });
  const health = (await healthResponse.json()) as {
    ok?: boolean;
    checks?: { releaseTarget?: string };
  };

  assert(healthResponse.ok && health.ok, "Local /api/health is not ready.");
  assert(
    health.checks?.releaseTarget === "local",
    "Customer web acceptance refuses to write unless /api/health reports RELEASE_TARGET=local.",
  );

  const executablePath =
    process.env.PLAYWRIGHT_CHROME_PATH?.trim() || DEFAULT_CHROME_PATH;
  assert(
    executablePath,
    "Set PLAYWRIGHT_CHROME_PATH to a Chrome or Chromium executable.",
  );

  const evidenceDirectory = path.resolve(
    process.env.PILOT_EVIDENCE_DIR?.trim() || ".pilot-evidence/web-customer",
  );
  await mkdir(evidenceDirectory, { recursive: true });

  const browser = await chromium.launch({ executablePath, headless: true });
  const context = await browser.newContext({
    locale: "ru-KZ",
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const runtimeErrors: string[] = [];

  page.on("pageerror", (error) => runtimeErrors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") {
      runtimeErrors.push(`console: ${message.text()}`);
    }
  });

  try {
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.evaluate(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });

    const phone = process.env.CUSTOMER_WEB_ACCEPTANCE_PHONE?.trim() || "+77000000002";
    await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
    await page.locator('input[name="phone"][type="tel"]').fill(phone);
    await Promise.all([
      page.waitForURL((url) => url.pathname === "/login" && url.searchParams.get("sent") === "1"),
      page.getByRole("button", { name: "Получить код" }).click(),
    ]);

    const otpCode = process.env.CUSTOMER_WEB_ACCEPTANCE_OTP_CODE?.trim() || "111111";
    await page.locator('input[name="code"]').fill(otpCode);
    await Promise.all([
      page.waitForURL((url) => url.pathname !== "/login"),
      page.getByRole("button", { name: "Войти", exact: true }).click(),
    ]);
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.screenshot({
      path: path.join(evidenceDirectory, "01-restaurants.png"),
      fullPage: true,
    });

    const restaurantLink = page.locator('a[href="/restaurants/tengri-kitchen"]').first();
    await restaurantLink.waitFor({ state: "visible" });
    await Promise.all([
      page.waitForURL((url) => url.pathname === "/restaurants/tengri-kitchen"),
      restaurantLink.click(),
    ]);

    await page.getByRole("button", { name: "В корзину" }).first().click();
    const checkoutLink = page.getByRole("link", { name: "Оформить заказ" });
    await checkoutLink.waitFor({ state: "visible" });
    await page.screenshot({
      path: path.join(evidenceDirectory, "02-menu-cart.png"),
      fullPage: true,
    });
    await Promise.all([
      page.waitForURL((url) => url.pathname === "/checkout"),
      checkoutLink.click(),
    ]);

    await page.locator('input[name="addressId"]:checked').waitFor({ state: "attached" });
    assert(
      await page.locator('input[name="paymentMethod"][value="cash_to_courier"]').isChecked(),
      "Cash payment is not selected on checkout.",
    );
    assert(
      await page.locator('input[name="paymentMethod"][value="online_card"]').isDisabled(),
      "Online card payment must remain disabled for this MVP.",
    );
    await page.screenshot({
      path: path.join(evidenceDirectory, "03-checkout-cash.png"),
      fullPage: true,
    });

    await Promise.all([
      page.waitForURL((url) => /^\/orders\/A-[A-Z0-9-]+$/.test(url.pathname)),
      page.getByRole("button", { name: "Создать заказ" }).click(),
    ]);

    const orderNumber = page.url().match(/\/orders\/(A-[A-Z0-9-]+)/)?.[1];
    assert(orderNumber, `Unexpected order status URL: ${page.url()}`);
    await page.getByText(orderNumber, { exact: false }).first().waitFor({ state: "visible" });
    await page.screenshot({
      path: path.join(evidenceDirectory, "04-order-status.png"),
      fullPage: true,
    });

    assert(
      runtimeErrors.length === 0,
      `Browser runtime errors:\n${runtimeErrors.join("\n")}`,
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          phone,
          restaurant: "tengri-kitchen",
          paymentMethod: "cash_to_courier",
          orderNumber,
          statusUrl: page.url(),
          evidenceDirectory,
        },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
