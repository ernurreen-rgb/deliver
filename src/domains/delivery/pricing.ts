type Coordinate = {
  latitude: number;
  longitude: number;
};

export function toNumber(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function calculateDistanceMeters(from: Coordinate, to: Coordinate) {
  const earthRadiusMeters = 6371000;
  const fromLat = (from.latitude * Math.PI) / 180;
  const toLat = (to.latitude * Math.PI) / 180;
  const deltaLat = ((to.latitude - from.latitude) * Math.PI) / 180;
  const deltaLng = ((to.longitude - from.longitude) * Math.PI) / 180;

  const haversine =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(fromLat) *
      Math.cos(toLat) *
      Math.sin(deltaLng / 2) *
      Math.sin(deltaLng / 2);

  const centralAngle =
    2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));

  return Math.round(earthRadiusMeters * centralAngle);
}

export function calculateDeliveryFee(input: {
  distanceMeters: number;
  baseFee: number;
  perKmFee: number;
  minFee?: number | null;
  maxFee?: number | null;
}) {
  const distanceKm = Math.ceil(input.distanceMeters / 1000);
  const rawFee = input.baseFee + distanceKm * input.perKmFee;
  const withMin = Math.max(rawFee, input.minFee ?? rawFee);
  return Math.min(withMin, input.maxFee ?? withMin);
}
