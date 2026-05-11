type GeocodeAddressInput = {
  city: string;
  addressLine: string;
  street?: string | null;
  house?: string | null;
};

type GeocodeResult = {
  latitude: string;
  longitude: string;
  source: "dev_fallback";
};

const ALMATY_DEV_COORDINATE = {
  latitude: "43.238949",
  longitude: "76.889709",
} as const;

export async function geocodeAddress(
  input: GeocodeAddressInput,
): Promise<GeocodeResult> {
  void input;

  return {
    ...ALMATY_DEV_COORDINATE,
    source: "dev_fallback",
  };
}
