import { revalidatePath } from "next/cache";
import type { NextRequest } from "next/server";
import type { CourierMutationResponse } from "@deliver/contracts/courier";
import { getCourierMobileDashboard } from "@/domains/couriers/api";
import {
  acceptCourierOfferForUser,
  rejectCourierOfferForUser,
} from "@/domains/delivery/dispatch";
import { requireApiCourier } from "../../../_lib/auth";
import {
  courierDomainError,
  parseCourierOfferActionRequest,
} from "../../../_lib/courier";
import { jsonError, jsonOk, readJsonObject } from "../../../_lib/responses";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ offerId: string }> },
) {
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

  const parsed = parseCourierOfferActionRequest(body);
  if ("response" in parsed) return parsed.response;

  const { offerId } = await context.params;
  const result =
    parsed.value.action === "accept"
      ? await acceptCourierOfferForUser({ offerId, userId: auth.user.id })
      : await rejectCourierOfferForUser({ offerId, userId: auth.user.id });

  const succeeded =
    result.status === "accepted" || result.status === "rejected";
  if (!succeeded) return courierDomainError(result.status);

  const dashboard = await getCourierMobileDashboard(auth.user.id);
  if (!dashboard) return courierDomainError("courier_not_found");

  revalidatePath("/courier");
  revalidatePath("/operator");
  revalidatePath("/restaurant");

  return jsonOk<CourierMutationResponse>({
    dashboard,
    orderNumber: "publicNumber" in result ? result.publicNumber : undefined,
  });
}
