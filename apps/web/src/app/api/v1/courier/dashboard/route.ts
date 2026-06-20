import type { NextRequest } from "next/server";
import type { CourierDashboardResponse } from "@deliver/contracts/courier";
import { getCourierMobileDashboard } from "@/domains/couriers/api";
import { requireApiCourier } from "../../_lib/auth";
import { jsonError, jsonOk } from "../../_lib/responses";

export async function GET(request: NextRequest) {
  const auth = await requireApiCourier(request);

  if ("response" in auth) return auth.response;

  const dashboard = await getCourierMobileDashboard(auth.user.id);

  if (!dashboard) {
    return jsonError({
      status: 404,
      code: "not_found",
      message: "Courier profile was not found.",
      reason: "courier_not_found",
    });
  }

  return jsonOk<CourierDashboardResponse>(dashboard);
}
