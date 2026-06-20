import type { RestaurantSummary } from "@deliver/contracts/catalog";
import { getApiRestaurants } from "@/domains/catalog/api";
import { jsonOk } from "../_lib/responses";

export async function GET() {
  const restaurants = await getApiRestaurants();

  return jsonOk<RestaurantSummary[]>(restaurants);
}
