import { resolveGeoProviderName } from "@/domains/geo/config";
import { devGeoProvider } from "@/domains/geo/dev-provider";
import { twoGisGeoProvider } from "@/domains/geo/twogis";
import type { GeoProvider } from "@/domains/geo/types";

export function getGeoProvider(): GeoProvider {
  return resolveGeoProviderName() === "2gis" ? twoGisGeoProvider : devGeoProvider;
}

export async function suggestAddresses(query: string) {
  return getGeoProvider().suggestAddresses(query);
}

export async function geocodeAddress(
  input: Parameters<GeoProvider["geocodeAddress"]>[0],
) {
  return getGeoProvider().geocodeAddress(input);
}

export async function reverseGeocodePoint(
  point: Parameters<GeoProvider["reverseGeocodePoint"]>[0],
) {
  return getGeoProvider().reverseGeocodePoint(point);
}
