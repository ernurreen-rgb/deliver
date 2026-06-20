import { describe, expect, it } from "vitest";
import { resolveGeoProviderName } from "@/domains/geo/config";
import { parseSubmittedGeoAddress } from "@/domains/geo/form";
import {
  normalizeTwoGisGeocode,
  normalizeTwoGisSuggestions,
} from "@/domains/geo/twogis";

describe("resolveGeoProviderName", () => {
  it("uses explicit provider from env", () => {
    expect(resolveGeoProviderName({ GEO_PROVIDER: "2gis" })).toBe("2gis");
    expect(resolveGeoProviderName({ GEO_PROVIDER: "dev" })).toBe("dev");
  });

  it("falls back to 2gis when a server API key exists", () => {
    expect(resolveGeoProviderName({ TWOGIS_API_KEY: "key" })).toBe("2gis");
  });

  it("uses dev provider without external keys", () => {
    expect(resolveGeoProviderName({})).toBe("dev");
  });
});

describe("parseSubmittedGeoAddress", () => {
  it("accepts only addresses with coordinates inside Almaty", () => {
    const parsed = parseSubmittedGeoAddress({
      city: "Алматы",
      addressLine: "проспект Абая, 10",
      latitude: "43.238949",
      longitude: "76.889709",
      geoProvider: "2gis",
      geoProviderPlaceId: "abc",
      geoSource: "2gis_geocode",
    });

    expect(parsed).toMatchObject({
      city: "Алматы",
      addressLine: "проспект Абая, 10",
      latitude: "43.238949",
      longitude: "76.889709",
      geoProvider: "2gis",
      geoProviderPlaceId: "abc",
      geoSource: "2gis_geocode",
    });
    expect(parsed?.geocodedAt).toBeInstanceOf(Date);
  });

  it("rejects missing and outside-service-area coordinates", () => {
    expect(
      parseSubmittedGeoAddress({
        city: "Алматы",
        addressLine: "проспект Абая, 10",
      }),
    ).toBeNull();

    expect(
      parseSubmittedGeoAddress({
        city: "Астана",
        addressLine: "Кабанбай батыра, 1",
        latitude: "51.128",
        longitude: "71.430",
      }),
    ).toBeNull();
  });
});

describe("2GIS response normalization", () => {
  it("normalizes suggestions and strips city prefix", () => {
    const suggestions = normalizeTwoGisSuggestions({
      result: {
        items: [
          {
            id: "item-1",
            full_address_name: "Алматы, проспект Абая, 10",
            address_name: "проспект Абая, 10",
            point: { lat: 43.238949, lon: 76.889709 },
          },
        ],
      },
    });

    expect(suggestions).toEqual([
      expect.objectContaining({
        id: "2gis:item-1",
        addressLine: "проспект Абая, 10",
        provider: "2gis",
        point: { latitude: 43.238949, longitude: 76.889709 },
      }),
    ]);
  });

  it("returns null for empty or outside-Almaty geocode results", () => {
    expect(normalizeTwoGisGeocode({}, "2gis_geocode")).toBeNull();
    expect(
      normalizeTwoGisGeocode(
        {
          result: {
            items: [
              {
                id: "outside",
                full_address_name: "Астана, Кабанбай батыра, 1",
                point: { lat: 51.128, lon: 71.43 },
              },
            ],
          },
        },
        "2gis_geocode",
      ),
    ).toBeNull();
  });
});
