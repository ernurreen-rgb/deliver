import { revalidatePath } from "next/cache";
import type { NextRequest } from "next/server";
import type { CourierMutationResponse } from "@deliver/contracts/courier";
import { getCourierMobileDashboard } from "@/domains/couriers/api";
import {
  setCourierOfflineForUser,
  setCourierOnlineForUser,
} from "@/domains/delivery/availability";
import { requireApiCourier } from "../../_lib/auth";
import {
  courierDomainError,
  parseCourierAvailabilityRequest,
} from "../../_lib/courier";
import { jsonError, jsonOk, readJsonObject } from "../../_lib/responses";

export async function PATCH(request: NextRequest) {
  const auth = await requireApiCourier(request);

  if ("response" in auth) return auth.response;

  const body = await readJsonObject(request);
  if (!body) {
    return jsonError({
      status: 400,
      code: "bad_request",
      message: "Expected a JSON object.",
    });
  }

  const parsed = parseCourierAvailabilityRequest(body);
  if ("response" in parsed) return parsed.response;

  const result = parsed.value.online
    ? await setCourierOnlineForUser(auth.user.id)
    : await setCourierOfflineForUser(auth.user.id);

  if (result.status !== "updated") return courierDomainError(result.status);

  const dashboard = await getCourierMobileDashboard(auth.user.id);
  if (!dashboard) return courierDomainError("courier_not_found");

  revalidatePath("/courier");
  revalidatePath("/operator");

  return jsonOk<CourierMutationResponse>({ dashboard });
}
