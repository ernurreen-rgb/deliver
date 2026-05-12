export type GeoProviderName = "dev" | "2gis";

export type GeoPoint = {
  latitude: number;
  longitude: number;
};

export type GeoSuggestion = {
  id: string;
  title: string;
  subtitle: string | null;
  addressLine: string;
  city: string;
  provider: GeoProviderName;
  providerPlaceId: string | null;
  point: GeoPoint | null;
};

export type GeocodeAddressInput = {
  city?: string | null;
  addressLine: string;
  providerPlaceId?: string | null;
};

export type GeocodeResult = {
  city: string;
  addressLine: string;
  latitude: string;
  longitude: string;
  provider: GeoProviderName;
  providerPlaceId: string | null;
  source: string;
};

export type GeoProvider = {
  name: GeoProviderName;
  suggestAddresses(query: string): Promise<GeoSuggestion[]>;
  geocodeAddress(input: GeocodeAddressInput): Promise<GeocodeResult | null>;
  reverseGeocodePoint(point: GeoPoint): Promise<GeocodeResult | null>;
};
