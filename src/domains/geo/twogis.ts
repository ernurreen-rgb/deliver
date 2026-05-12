import {
  ALMATY_CENTER,
  ALMATY_CITY,
  formatCoordinate,
  isPointInAlmaty,
  normalizeAlmatyAddressLine,
} from "@/domains/geo/bounds";
import { getTwoGisApiKey } from "@/domains/geo/config";
import type {
  GeocodeAddressInput,
  GeocodeResult,
  GeoPoint,
  GeoProvider,
  GeoSuggestion,
} from "@/domains/geo/types";

const TWOGIS_BASE_URL = "https://catalog.api.2gis.com/3.0";

type TwoGisPoint = {
  lat?: number;
  lon?: number;
};

type TwoGisItem = {
  id?: string;
  name?: string;
  full_name?: string;
  address_name?: string;
  full_address_name?: string;
  point?: TwoGisPoint;
  search_attributes?: {
    suggested_text?: string;
  };
};

type TwoGisResponse = {
  result?: {
    items?: TwoGisItem[];
  };
};

function getRequiredApiKey() {
  const apiKey = getTwoGisApiKey();

  if (!apiKey) {
    throw new Error("TWOGIS_API_KEY is required when GEO_PROVIDER=2gis.");
  }

  return apiKey;
}

function toPoint(item: TwoGisItem): GeoPoint | null {
  const latitude = Number(item.point?.lat);
  const longitude = Number(item.point?.lon);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return { latitude, longitude };
}

function toTitle(item: TwoGisItem) {
  return (
    item.full_address_name ??
    item.full_name ??
    item.address_name ??
    item.name ??
    item.search_attributes?.suggested_text ??
    ""
  ).trim();
}

function toAddressLine(item: TwoGisItem) {
  return normalizeAlmatyAddressLine(
    item.full_address_name ?? item.address_name ?? item.full_name ?? item.name ?? "",
  );
}

async function fetchTwoGis(path: string, params: URLSearchParams) {
  params.set("key", getRequiredApiKey());
  params.set("locale", "ru_KZ");

  const response = await fetch(`${TWOGIS_BASE_URL}${path}?${params.toString()}`, {
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`2GIS request failed with ${response.status}.`);
  }

  return (await response.json()) as TwoGisResponse;
}

export function normalizeTwoGisSuggestions(payload: TwoGisResponse) {
  const items = payload.result?.items ?? [];

  return items
    .map((item): GeoSuggestion | null => {
      const title = toTitle(item);

      if (!title) {
        return null;
      }

      const point = toPoint(item);

      if (point && !isPointInAlmaty(point)) {
        return null;
      }

      return {
        id: item.id ? `2gis:${item.id}` : `2gis:${title}`,
        title,
        subtitle: item.address_name ?? item.name ?? null,
        addressLine: toAddressLine(item) || title,
        city: ALMATY_CITY,
        provider: "2gis",
        providerPlaceId: item.id ?? null,
        point,
      };
    })
    .filter((item): item is GeoSuggestion => item !== null);
}

export function normalizeTwoGisGeocode(payload: TwoGisResponse, source: string) {
  const item = payload.result?.items?.[0];

  if (!item) {
    return null;
  }

  const point = toPoint(item);

  if (!point || !isPointInAlmaty(point)) {
    return null;
  }

  const addressLine = toAddressLine(item);

  return {
    city: ALMATY_CITY,
    addressLine: addressLine || toTitle(item),
    latitude: formatCoordinate(point.latitude),
    longitude: formatCoordinate(point.longitude),
    provider: "2gis",
    providerPlaceId: item.id ?? null,
    source,
  } satisfies GeocodeResult;
}

export const twoGisGeoProvider: GeoProvider = {
  name: "2gis",

  async suggestAddresses(query: string) {
    const params = new URLSearchParams({
      q: query,
      suggest_type: "address",
      fields: "items.point,items.address,items.full_address_name",
      location: `${ALMATY_CENTER.longitude},${ALMATY_CENTER.latitude}`,
      viewpoint1: "76.700000,43.420000",
      viewpoint2: "77.200000,43.050000",
      page_size: "8",
    });
    const payload = await fetchTwoGis("/suggests", params);

    return normalizeTwoGisSuggestions(payload);
  },

  async geocodeAddress(input: GeocodeAddressInput) {
    const params = new URLSearchParams({
      q: `${input.city ?? ALMATY_CITY}, ${input.addressLine}`,
      fields: "items.point,items.address,items.full_address_name",
      page_size: "1",
    });
    const payload = await fetchTwoGis("/items/geocode", params);

    return normalizeTwoGisGeocode(payload, "2gis_geocode");
  },

  async reverseGeocodePoint(point: GeoPoint) {
    const params = new URLSearchParams({
      lat: String(point.latitude),
      lon: String(point.longitude),
      fields: "items.point,items.address,items.full_address_name",
      page_size: "1",
    });
    const payload = await fetchTwoGis("/items/geocode", params);

    return normalizeTwoGisGeocode(payload, "2gis_reverse");
  },
};
