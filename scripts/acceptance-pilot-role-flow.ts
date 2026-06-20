import "dotenv/config";
import { DEV_OTP_CODE, SESSION_COOKIE_NAME } from "../src/domains/auth/constants";
import { getPrisma } from "../src/lib/db/prisma";
import { getReleaseTarget } from "../src/lib/release-env";
import { runSmokeCashOrder } from "./smoke-cash-order";

const ADMIN_PHONE = "+77000000001";
const CUSTOMER_PHONE = "+77000000002";
const COURIER_PHONE = "+77000000003";
type AcceptanceCheck = {
  name: string;
  ok: boolean;
  message: string;
};

type SmokeSummary = Awaited<ReturnType<typeof runSmokeCashOrder>>["summary"];

type HtmlInput = {
  name: string;
  value: string;
};

type HtmlForm = {
  inputs: HtmlInput[];
};

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

function assertAcceptanceTarget(baseUrl: string) {
  const releaseTarget = getReleaseTarget(process.env);

  assert(
    releaseTarget,
    "RELEASE_TARGET must be one of: local, staging, production for pilot acceptance checks.",
  );

  if (
    releaseTarget !== "local" &&
    (!process.env.APP_BASE_URL?.trim() ||
      (isLocalBaseUrl(baseUrl) && process.env.ALLOW_LOCAL_API_CHECK !== "1"))
  ) {
    throw new Error(
      "APP_BASE_URL must explicitly point to the deployed staging/production URL for non-local pilot acceptance checks.",
    );
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function decodeHtml(value: string) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#34;", "\"")
    .replaceAll("&#x27;", "'")
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function readAttribute(tag: string, name: string) {
  const quoted = tag.match(new RegExp(`${name}="([^"]*)"`, "i"));
  if (quoted) {
    return decodeHtml(quoted[1]);
  }

  const singleQuoted = tag.match(new RegExp(`${name}='([^']*)'`, "i"));
  if (singleQuoted) {
    return decodeHtml(singleQuoted[1]);
  }

  return "";
}

function parseForms(html: string): HtmlForm[] {
  return Array.from(html.matchAll(/<form\b[^>]*>([\s\S]*?)<\/form>/gi)).map(
    ([, formBody]) => ({
      inputs: Array.from(formBody.matchAll(/<input\b[^>]*>/gi))
        .map(([inputTag]) => ({
          name: readAttribute(inputTag, "name"),
          value: readAttribute(inputTag, "value"),
        }))
        .filter((input) => input.name),
    }),
  );
}

function findForm(html: string, requiredFields: string[]) {
  const form = parseForms(html).find((candidate) =>
    requiredFields.every((field) =>
      candidate.inputs.some((input) => input.name === field),
    ),
  );

  assert(
    form,
    `Could not find form with fields: ${requiredFields.join(", ")}.`,
  );

  return form;
}

function getSetCookieHeaders(headers: Headers) {
  const maybeGetSetCookie = headers as Headers & {
    getSetCookie?: () => string[];
  };

  if (typeof maybeGetSetCookie.getSetCookie === "function") {
    return maybeGetSetCookie.getSetCookie();
  }

  const header = headers.get("set-cookie");
  return header ? [header] : [];
}

class BrowserSession {
  private cookies = new Map<string, string>();
  private readonly baseOrigin: string;

  constructor(
    private readonly baseUrl: string,
    readonly name: string,
  ) {
    this.baseOrigin = new URL(baseUrl).origin;
  }

  private buildUrl(pathOrUrl: string) {
    const url = new URL(pathOrUrl, `${this.baseUrl}/`);

    if (url.origin !== this.baseOrigin) {
      throw new Error(
        `${this.name} blocked cross-origin navigation from ${this.baseOrigin} to ${url.origin}.`,
      );
    }

    return url.toString();
  }

  private cookieHeader() {
    return Array.from(this.cookies.entries())
      .map(([key, value]) => `${key}=${value}`)
      .join("; ");
  }

  private storeCookies(response: Response) {
    for (const setCookie of getSetCookieHeaders(response.headers)) {
      const [pair] = setCookie.split(";");
      const separatorIndex = pair.indexOf("=");

      if (separatorIndex === -1) {
        continue;
      }

      const key = pair.slice(0, separatorIndex).trim();
      const value = pair.slice(separatorIndex + 1).trim();

      if (key && value) {
        this.cookies.set(key, value);
      }
    }
  }

  hasSessionCookie() {
    return this.cookies.has(SESSION_COOKIE_NAME);
  }

  async fetch(pathOrUrl: string, init: RequestInit = {}) {
    const url = this.buildUrl(pathOrUrl);
    const headers = new Headers(init.headers);
    headers.set("Accept", "text/html,application/xhtml+xml");

    const cookie = this.cookieHeader();
    if (cookie) {
      headers.set("Cookie", cookie);
    }

    const response = await fetch(url, {
      ...init,
      headers,
      redirect: "manual",
    });

    this.storeCookies(response);
    return response;
  }

  async get(pathOrUrl: string) {
    const response = await this.fetch(pathOrUrl);
    const body = await response.text();
    return { body, response };
  }

  async submitForm(
    pathOrUrl: string,
    form: HtmlForm,
    overrides: Record<string, string>,
  ) {
    const formData = new FormData();

    for (const input of form.inputs) {
      formData.set(input.name, input.value);
    }

    for (const [key, value] of Object.entries(overrides)) {
      formData.set(key, value);
    }

    return this.fetch(pathOrUrl, {
      body: formData,
      method: "POST",
    });
  }

  async follow(response: Response, maxRedirects = 5) {
    let current = response;
    let body = "";
    let url = current.url;

    for (let index = 0; index <= maxRedirects; index += 1) {
      if (
        current.status >= 300 &&
        current.status < 400 &&
        current.headers.has("location")
      ) {
        const location = current.headers.get("location");
        assert(location, "Redirect response has no location header.");
        const nextUrl = new URL(location, current.url).toString();
        current = await this.fetch(nextUrl);
        url = current.url;
        continue;
      }

      body = await current.text();
      url = current.url;
      break;
    }

    return { body, response: current, url };
  }
}

function requireText(body: string, text: string, label: string): AcceptanceCheck {
  const ok = body.includes(text);

  return {
    name: label,
    ok,
    message: ok ? `Found "${text}".` : `Missing "${text}".`,
  };
}

function requireNotText(
  body: string,
  text: string,
  label: string,
): AcceptanceCheck {
  const ok = !body.includes(text);

  return {
    name: label,
    ok,
    message: ok ? `Did not find "${text}".` : `Unexpectedly found "${text}".`,
  };
}

function requireStatus(
  response: Response,
  expectedStatus: number,
  label: string,
): AcceptanceCheck {
  const ok = response.status === expectedStatus;

  return {
    name: label,
    ok,
    message: ok
      ? `HTTP ${expectedStatus}.`
      : `Expected HTTP ${expectedStatus}, got ${response.status}.`,
  };
}

function requirePath(url: string, expectedPath: string, label: string) {
  const actualPath = new URL(url).pathname;
  const ok = actualPath === expectedPath;

  return {
    name: label,
    ok,
    message: ok
      ? `Path is ${expectedPath}.`
      : `Expected path ${expectedPath}, got ${actualPath}.`,
  };
}

function requireRedirectLocation(
  response: Response,
  expectedPathAndSearch: string,
  label: string,
): AcceptanceCheck {
  const location = response.headers.get("location");
  const actual = location
    ? `${new URL(location, response.url).pathname}${new URL(location, response.url).search}`
    : "";
  const ok =
    response.status >= 300 &&
    response.status < 400 &&
    actual === expectedPathAndSearch;

  return {
    name: label,
    ok,
    message: ok
      ? `Redirected to ${expectedPathAndSearch}.`
      : `Expected redirect to ${expectedPathAndSearch}, got HTTP ${response.status} ${actual || "<no location>"}.`,
  };
}

async function loginWithOtp(input: {
  baseUrl: string;
  nextPath: string;
  phone: string;
  sessionName: string;
}) {
  const session = new BrowserSession(input.baseUrl, input.sessionName);
  const loginPath = `/login?phone=${encodeURIComponent(input.phone)}&next=${encodeURIComponent(
    input.nextPath,
  )}`;
  const initial = await session.get(loginPath);
  assert(
    initial.response.status === 200,
    `${input.sessionName} login page returned ${initial.response.status}.`,
  );

  const requestCodeForm = findForm(initial.body, ["phone", "next"]);
  const requestCodeResponse = await session.submitForm(loginPath, requestCodeForm, {
    next: input.nextPath,
    phone: input.phone,
  });
  const sent = await session.follow(requestCodeResponse);
  const sentUrl = new URL(sent.url);
  const sentPathAndSearch = `${sentUrl.pathname}${sentUrl.search}`;
  assert(
    sentUrl.searchParams.get("sent") === "1" && !sentUrl.searchParams.has("error"),
    `${input.sessionName} OTP request did not reach sent=1 state: ${sentPathAndSearch}.`,
  );
  assert(
    sent.body.includes('name="next"') && sent.body.includes(input.nextPath),
    `${input.sessionName} OTP request did not preserve next path ${input.nextPath}.`,
  );

  const verifyForm = findForm(sent.body, ["phone", "next", "code"]);
  const verifyResponse = await session.submitForm(sent.url, verifyForm, {
    code: DEV_OTP_CODE,
    next: input.nextPath,
    phone: input.phone,
  });
  const destination = await session.follow(verifyResponse);
  const destinationUrl = new URL(destination.url);
  const destinationPath = destinationUrl.pathname;
  const destinationPathAndSearch = `${destinationUrl.pathname}${destinationUrl.search}`;

  assert(
    destination.response.status === 200,
    `${input.sessionName} destination returned ${destination.response.status}.`,
  );
  assert(
    destinationPath === input.nextPath,
    `${input.sessionName} expected redirect to ${input.nextPath}, got ${destinationPathAndSearch}.`,
  );
  assert(
    session.hasSessionCookie(),
    `${input.sessionName} did not receive ${SESSION_COOKIE_NAME}.`,
  );

  return { destination, session };
}

async function main() {
  const baseUrl = normalizeBaseUrl(process.env.APP_BASE_URL);
  assertAcceptanceTarget(baseUrl);

  const smoke = await runSmokeCashOrder();
  const order: SmokeSummary = smoke.summary;
  const checks: AcceptanceCheck[] = [];

  const anonymous = new BrowserSession(baseUrl, "anonymous");
  const [
    anonymousOperator,
    anonymousPilot,
    anonymousRestaurant,
    anonymousCourier,
  ] = await Promise.all([
    anonymous.get("/operator"),
    anonymous.get("/operator/pilot"),
    anonymous.get("/restaurant"),
    anonymous.get("/courier"),
  ]);
  checks.push(
    requireRedirectLocation(
      anonymousOperator.response,
      "/login?next=%2Foperator",
      "anonymous_operator_preserves_next",
    ),
    requireRedirectLocation(
      anonymousPilot.response,
      "/login?next=%2Foperator%2Fpilot",
      "anonymous_operator_pilot_preserves_next",
    ),
    requireRedirectLocation(
      anonymousRestaurant.response,
      "/login?next=%2Frestaurant",
      "anonymous_restaurant_preserves_next",
    ),
    requireRedirectLocation(
      anonymousCourier.response,
      "/login?next=%2Fcourier",
      "anonymous_courier_preserves_next",
    ),
  );

  const anonymousOrder = await anonymous.get(`/orders/${order.publicNumber}`);
  checks.push(
    requireStatus(
      anonymousOrder.response,
      200,
      "anonymous_order_page_status",
    ),
    requireText(
      anonymousOrder.body,
      `/login?next=%2Forders%2F${order.publicNumber}`,
      "anonymous_order_requires_login_with_next",
    ),
  );

  const customer = await loginWithOtp({
    baseUrl,
    nextPath: `/orders/${order.publicNumber}`,
    phone: CUSTOMER_PHONE,
    sessionName: "customer",
  });
  checks.push(
    requireStatus(
      customer.destination.response,
      200,
      "customer_order_page_status",
    ),
    requirePath(
      customer.destination.url,
      `/orders/${order.publicNumber}`,
      "customer_order_page_path",
    ),
    requireText(customer.destination.body, order.publicNumber, "customer_sees_order"),
    requireText(customer.destination.body, CUSTOMER_PHONE, "customer_header_identity"),
  );

  const admin = await loginWithOtp({
    baseUrl,
    nextPath: "/operator/pilot",
    phone: ADMIN_PHONE,
    sessionName: "admin",
  });
  checks.push(
    requireStatus(
      admin.destination.response,
      200,
      "admin_pilot_page_status",
    ),
    requirePath(
      admin.destination.url,
      "/operator/pilot",
      "admin_pilot_page_path",
    ),
    requireText(admin.destination.body, ADMIN_PHONE, "admin_header_identity"),
    requireText(admin.destination.body, "/login?phone=%2B77000000002&amp;next=%2F", "pilot_customer_switch_link"),
    requireText(admin.destination.body, "/login?phone=%2B77000000003&amp;next=%2Fcourier", "pilot_courier_switch_link"),
    requireText(admin.destination.body, order.publicNumber, "pilot_latest_cash_order_matches_smoke"),
  );

  const operatorPage = await admin.session.get("/operator");
  checks.push(
    requireStatus(operatorPage.response, 200, "operator_page_status"),
    requireText(
      operatorPage.body,
      order.publicNumber,
      "operator_includes_smoke_order",
    ),
    requireText(operatorPage.body, "Текущий pilot cash-order", "operator_has_pilot_focus"),
  );

  const restaurantPage = await admin.session.get("/restaurant");
  checks.push(
    requireStatus(restaurantPage.response, 200, "restaurant_page_status"),
    requireText(restaurantPage.body, ADMIN_PHONE, "restaurant_header_identity"),
    requireText(restaurantPage.body, 'data-surface="restaurant"', "restaurant_surface_accessible"),
    requireText(restaurantPage.body, "Tengri Kitchen", "restaurant_dashboard_name"),
    requireNotText(
      restaurantPage.body,
      "Этот аккаунт пока не привязан к ресторану",
      "restaurant_not_warning_shell",
    ),
  );

  const courier = await loginWithOtp({
    baseUrl,
    nextPath: "/courier",
    phone: COURIER_PHONE,
    sessionName: "courier",
  });
  checks.push(
    requireStatus(courier.destination.response, 200, "courier_page_status"),
    requirePath(courier.destination.url, "/courier", "courier_page_path"),
    requireText(courier.destination.body, COURIER_PHONE, "courier_header_identity"),
    requireText(courier.destination.body, 'data-surface="courier"', "courier_surface_accessible"),
    requireText(courier.destination.body, "Доступность:", "courier_dashboard_availability"),
    requireNotText(
      courier.destination.body,
      "Профиль курьера еще не создан",
      "courier_not_warning_shell",
    ),
  );

  const ok = checks.every((check) => check.ok);

  console.log(
    JSON.stringify(
      {
        ok,
        baseUrl,
        checks,
        order: {
          deliveryStatus: order.deliveryStatus,
          paymentStatus: order.paymentStatus,
          publicNumber: order.publicNumber,
          status: order.orderStatus,
        },
      },
      null,
      2,
    ),
  );

  if (!ok) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await getPrisma().$disconnect();
  });
