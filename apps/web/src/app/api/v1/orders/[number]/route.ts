import type { NextRequest } from "next/server";
import type { OrderStatusResponse } from "@deliver/contracts/orders";
import { getApiOrderStatus } from "@/domains/orders/api";
import { requireApiCustomer } from "../../_lib/auth";
import { jsonError, jsonOk } from "../../_lib/responses";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ number: string }> },
) {
  const auth = await requireApiCustomer(request);

  if ("response" in auth) {
    return auth.response;
  }

  const { number } = await context.params;
  const order = await getApiOrderStatus({
    customerId: auth.user.id,
    publicNumber: decodeURIComponent(number),
  });

  if (!order) {
    return jsonError({
      status: 404,
      code: "not_found",
      message: "Order was not found.",
    });
  }

  return jsonOk<OrderStatusResponse>(order);
}
