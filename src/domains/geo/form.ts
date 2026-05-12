import {
  ALMATY_CITY,
  formatCoordinate,
  isPointInAlmaty,
  parseGeoPoint,
} from "@/domains/geo/bounds";
import type { GeoProviderName } from "@/domains/geo/types";

const geoProviders = new Set<GeoProviderName>(["dev", "2gis"]);

export type SubmittedGeoAddress = {
  city: string;
  addressLine: string;
  latitude: string;
  longitude: string;
  geoProvider: GeoProviderName;
  geoProviderPlaceId: string | null;
  geoSource: string;
  geocodedAt: Date;
};

export function parseSubmittedGeoAddress(input: {
  city?: string;
  addressLine?: string;
  latitude?: string;
  longitude?: string;
  geoProvider?: string;
  geoProviderPlaceId?: string;
  geoSource?: string;
}): SubmittedGeoAddress | null {
  const addressLine = input.addressLine?.trim() ?? "";
  const point = parseGeoPoint({
    latitude: input.latitude?.trim() ?? "",
    longitude: input.longitude?.trim() ?? "",
  });

  if (!addressLine || !point || !isPointInAlmaty(point)) {
    return null;
  }

  const provider = input.geoProvider?.trim();
  const geoProvider = geoProviders.has(provider as GeoProviderName)
    ? (provider as GeoProviderName)
    : "dev";

  return {
    city: input.city?.trim() || ALMATY_CITY,
    addressLine,
    latitude: formatCoordinate(point.latitude),
    longitude: formatCoordinate(point.longitude),
    geoProvider,
    geoProviderPlaceId: input.geoProviderPlaceId?.trim() || null,
    geoSource: input.geoSource?.trim() || `${geoProvider}_geocode`,
    geocodedAt: new Date(),
  };
}
