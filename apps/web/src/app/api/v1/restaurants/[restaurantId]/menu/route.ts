import type { RestaurantMenu } from "@deliver/contracts/catalog";
import { getApiRestaurantMenu } from "@/domains/catalog/api";
import { jsonError, jsonOk } from "../../../_lib/responses";

export async function GET(
  _request: Request,
  context: { params: Promise<{ restaurantId: string }> },
) {
  const { restaurantId } = await context.params;
  const menu = await getApiRestaurantMenu(restaurantId);

  if (!menu) {
    return jsonError({
      status: 404,
      code: "not_found",
      message: "Restaurant was not found.",
    });
  }

  return jsonOk<RestaurantMenu>(menu);
}
