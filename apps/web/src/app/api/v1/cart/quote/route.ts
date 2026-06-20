import type { NextRequest } from "next/server";
import type { CartQuote } from "@deliver/contracts/orders";
import { quoteCashCart } from "@/domains/orders/api";
import { requireApiCustomer } from "../../_lib/auth";
import { parseCartQuoteRequest } from "../../_lib/orders";
import { jsonError, jsonOk, readJsonObject } from "../../_lib/responses";

export async function POST(request: NextRequest) {
  const auth = await requireApiCustomer(request);

  if ("response" in auth) {
    return auth.response;
  }

  const body = await readJsonObject(request);

  if (!body) {
    return jsonError({
      status: 400,
      code: "bad_request",
      message: "Expected a JSON object.",
    });
  }

  const parsed = parseCartQuoteRequest(body);

  if ("response" in parsed) {
    return parsed.response;
  }

  const result = await quoteCashCart(parsed.value);

  if (result.status === "failed") {
    return jsonError({
      status: 400,
      code: "validation_failed",
      message: "The cart cannot be quoted.",
      reason: result.error,
    });
  }

  return jsonOk<CartQuote>(result.quote);
}
