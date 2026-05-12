import type { GeoPoint } from "@/domains/geo/types";

export const ALMATY_CITY = "Алматы";

export const ALMATY_CENTER: GeoPoint = {
  latitude: 43.238949,
  longitude: 76.889709,
};

const ALMATY_BOUNDS = {
  minLatitude: 43.05,
  maxLatitude: 43.42,
  minLongitude: 76.7,
  maxLongitude: 77.2,
} as const;

export function isPointInAlmaty(point: GeoPoint) {
  return (
    point.latitude >= ALMATY_BOUNDS.minLatitude &&
    point.latitude <= ALMATY_BOUNDS.maxLatitude &&
    point.longitude >= ALMATY_BOUNDS.minLongitude &&
    point.longitude <= ALMATY_BOUNDS.maxLongitude
  );
}

export function formatCoordinate(value: number) {
  return value.toFixed(6);
}

export function parseGeoPoint(input: {
  latitude: string;
  longitude: string;
}) {
  const latitude = Number(input.latitude);
  const longitude = Number(input.longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return { latitude, longitude };
}

export function normalizeAlmatyAddressLine(value: string) {
  return value.replace(/^алматы,?\s*/i, "").trim();
}
