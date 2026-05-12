import type { GeoProviderName } from "@/domains/geo/types";

type GeoProviderEnv = {
  GEO_PROVIDER?: string;
  TWOGIS_API_KEY?: string;
};

export function resolveGeoProviderName(
  env: GeoProviderEnv = {
    GEO_PROVIDER: process.env.GEO_PROVIDER,
    TWOGIS_API_KEY: process.env.TWOGIS_API_KEY,
  },
): GeoProviderName {
  if (env.GEO_PROVIDER === "2gis" || env.GEO_PROVIDER === "dev") {
    return env.GEO_PROVIDER;
  }

  return env.TWOGIS_API_KEY ? "2gis" : "dev";
}

export function getTwoGisApiKey() {
  return process.env.TWOGIS_API_KEY ?? "";
}

export function getTwoGisMapKey() {
  return process.env.NEXT_PUBLIC_TWOGIS_MAP_KEY ?? "";
}
