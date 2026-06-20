import type { NextRequest } from "next/server";
import type { OrderStatusResponse } from "@deliver/contracts/orders";
import { createCashOrderForCustomer } from "@/domains/orders/api";
import { requireApiCustomer } from "../../_lib/auth";
import { parseCreateCashOrderRequest } from "../../_lib/orders";
import { jsonError, jsonOk, readJsonObject } from "../../_lib/responses";

function getOrderErrorStatus(error: string) {
  return error === "checkout_request_conflict" ? 409 : 400;
}

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

  const parsed = parseCreateCashOrderRequest(body);

  if ("response" in parsed) {
    return parsed.response;
  }

  const result = await createCashOrderForCustomer({
    customer: auth.user,
    order: parsed.value,
  });

  if (result.status === "failed") {
    return jsonError({
      status: getOrderErrorStatus(result.error),
      code:
        result.error === "checkout_request_conflict"
          ? "conflict"
          : "validation_failed",
      message: "The cash order cannot be created.",
      reason: result.error,
    });
  }

  return jsonOk<OrderStatusResponse>(result.order, { status: 201 });
}
