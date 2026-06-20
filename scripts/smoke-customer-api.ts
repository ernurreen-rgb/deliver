import "dotenv/config";
import type { RequestOtpResponse, VerifyOtpResponse } from "@deliver/contracts/auth";
import type { RestaurantMenu, RestaurantSummary } from "@deliver/contracts/catalog";
import type {
  CartQuote,
  OrderStatusResponse,
} from "@deliver/contracts/orders";
import type { ApiResult } from "@deliver/contracts";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

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
    "Customer API smoke creates a real order and therefore only accepts a local APP_BASE_URL.",
  );

  return baseUrl;
}

async function readApiResult<T>(response: Response) {
  const result = (await response.json()) as ApiResult<T>;

  assert(
    response.ok && result.ok,
    `API request failed (${response.status}): ${
      result.ok
        ? "unexpected response"
        : `${result.error.code}/${result.error.reason ?? "unknown"}: ${result.error.message}`
    }`,
  );

  return result.data;
}

async function request<T>(
  baseUrl: string,
  path: string,
  init?: RequestInit,
) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  return readApiResult<T>(response);
}

async function main() {
  const baseUrl = getBaseUrl();
  const health = await fetch(`${baseUrl}/api/health`, {
    headers: { Accept: "application/json" },
  });
  const healthBody = (await health.json()) as {
    ok?: boolean;
    checks?: { releaseTarget?: string };
  };

  assert(health.ok && healthBody.ok, "Local /api/health is not ready.");
  assert(
    healthBody.checks?.releaseTarget === "local",
    "Customer API smoke refuses to write unless /api/health reports RELEASE_TARGET=local.",
  );

  const phone = process.env.CUSTOMER_API_SMOKE_PHONE?.trim() || "+77000000002";
  const otp = await request<RequestOtpResponse>(baseUrl, "/api/v1/auth/otp/request", {
    method: "POST",
    body: JSON.stringify({ phone }),
  });
  const code = process.env.CUSTOMER_API_SMOKE_OTP_CODE?.trim() || otp.devCode;

  assert(
    code,
    "OTP code is not exposed. Set CUSTOMER_API_SMOKE_OTP_CODE for this local environment.",
  );

  const auth = await request<VerifyOtpResponse>(baseUrl, "/api/v1/auth/otp/verify", {
    method: "POST",
    body: JSON.stringify({ phone, code }),
  });
  const authorization = { Authorization: `Bearer ${auth.accessToken}` };
  const restaurants = await request<RestaurantSummary[]>(
    baseUrl,
    "/api/v1/restaurants",
  );
  const restaurantSlug =
    process.env.CUSTOMER_API_SMOKE_RESTAURANT?.trim() || "tengri-kitchen";
  const restaurant = restaurants.find((item) => item.slug === restaurantSlug);

  assert(restaurant, `Restaurant ${restaurantSlug} is missing from the API.`);

  const menu = await request<RestaurantMenu>(
    baseUrl,
    `/api/v1/restaurants/${encodeURIComponent(restaurant.slug)}/menu`,
  );
  const menuItem = menu.categories.flatMap((category) => category.items).find(
    (item) => item.isAvailable,
  );

  assert(menuItem, `Restaurant ${restaurantSlug} has no available menu item.`);

  const cart = {
    restaurantId: restaurant.id,
    items: [{ menuItemId: menuItem.id, quantity: 1 }],
    deliveryAddress: {
      label: "Дом",
      addressLine: "проспект Абая, 10",
      latitude: 43.238949,
      longitude: 76.889709,
    },
  };
  const quote = await request<CartQuote>(baseUrl, "/api/v1/cart/quote", {
    method: "POST",
    headers: authorization,
    body: JSON.stringify(cart),
  });
  const createdOrder = await request<OrderStatusResponse>(
    baseUrl,
    "/api/v1/orders/cash",
    {
      method: "POST",
      headers: authorization,
      body: JSON.stringify({
        ...cart,
        idempotencyKey: `customer-api-smoke-${Date.now()}-${crypto.randomUUID()}`,
        customerComment: "customer-api-smoke",
      }),
    },
  );
  const order = await request<OrderStatusResponse>(
    baseUrl,
    `/api/v1/orders/${encodeURIComponent(createdOrder.number)}`,
    { headers: authorization },
  );

  assert(order.number === createdOrder.number, "Created order cannot be read back.");
  assert(order.total === quote.total, "Order total differs from the quoted total.");
  assert(order.events.length > 0, "Order status history is empty.");

  await request<{ loggedOut: boolean }>(baseUrl, "/api/v1/auth/session", {
    method: "DELETE",
    headers: authorization,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        phone,
        restaurant: restaurant.slug,
        item: menuItem.name,
        quoteTotal: quote.total,
        orderNumber: order.number,
        orderStatus: order.status,
        statusEvents: order.events.length,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
