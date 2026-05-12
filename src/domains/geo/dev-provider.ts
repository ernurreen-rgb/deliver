import {
  ALMATY_CENTER,
  ALMATY_CITY,
  formatCoordinate,
  normalizeAlmatyAddressLine,
} from "@/domains/geo/bounds";
import type {
  GeocodeAddressInput,
  GeocodeResult,
  GeoPoint,
  GeoProvider,
  GeoSuggestion,
} from "@/domains/geo/types";

function hashText(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function pointFromText(value: string): GeoPoint {
  const hash = hashText(value.toLowerCase());
  const latOffset = ((hash % 2200) - 1100) / 100000;
  const lngOffset = (((hash >>> 8) % 2600) - 1300) / 100000;

  return {
    latitude: ALMATY_CENTER.latitude + latOffset,
    longitude: ALMATY_CENTER.longitude + lngOffset,
  };
}

function toResult(addressLine: string, point: GeoPoint, source: string): GeocodeResult {
  return {
    city: ALMATY_CITY,
    addressLine: normalizeAlmatyAddressLine(addressLine) || addressLine,
    latitude: formatCoordinate(point.latitude),
    longitude: formatCoordinate(point.longitude),
    provider: "dev",
    providerPlaceId: null,
    source,
  };
}

export const devGeoProvider: GeoProvider = {
  name: "dev",

  async suggestAddresses(query: string): Promise<GeoSuggestion[]> {
    const text = normalizeAlmatyAddressLine(query);

    if (text.length < 2) {
      return [];
    }

    const primaryPoint = pointFromText(text);
    const secondaryPoint = pointFromText(`${text} корпус`);

    return [
      {
        id: `dev:${hashText(text)}`,
        title: `${ALMATY_CITY}, ${text}`,
        subtitle: "dev",
        addressLine: text,
        city: ALMATY_CITY,
        provider: "dev",
        providerPlaceId: null,
        point: primaryPoint,
      },
      {
        id: `dev:${hashText(`${text}:nearby`)}`,
        title: `${ALMATY_CITY}, ${text}, рядом`,
        subtitle: "dev",
        addressLine: `${text}, рядом`,
        city: ALMATY_CITY,
        provider: "dev",
        providerPlaceId: null,
        point: secondaryPoint,
      },
    ];
  },

  async geocodeAddress(input: GeocodeAddressInput) {
    const addressLine = normalizeAlmatyAddressLine(input.addressLine);

    if (addressLine.length < 2) {
      return null;
    }

    return toResult(addressLine, pointFromText(addressLine), "dev_geocode");
  },

  async reverseGeocodePoint(point: GeoPoint) {
    return toResult("Уточненная точка на карте", point, "dev_reverse");
  },
};
