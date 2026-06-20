"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GeocodeResult, GeoSuggestion } from "@/domains/geo/types";

type AddressPickerInitialValue = {
  city?: string | null;
  addressLine?: string | null;
  latitude?: string | number | null;
  longitude?: string | number | null;
  geoProvider?: string | null;
  geoProviderPlaceId?: string | null;
  geoSource?: string | null;
};

type AddressPickerProps = {
  initialValue?: AddressPickerInitialValue;
  mapApiKey: string;
  searchLabel?: string;
};

type SelectedAddress = {
  city: string;
  addressLine: string;
  latitude: number;
  longitude: number;
  geoProvider: string;
  geoProviderPlaceId: string | null;
  geoSource: string;
};

type SuggestResponse = {
  suggestions?: GeoSuggestion[];
  error?: string;
};

type GeocodeResponse = {
  result?: GeocodeResult;
  error?: string;
};

type MapglMap = {
  on?: (event: string, callback: (event: unknown) => void) => void;
  setCenter?: (coordinates: [number, number]) => void;
  setZoom?: (zoom: number) => void;
  destroy?: () => void;
};

type MapglMarker = {
  setCoordinates?: (coordinates: [number, number]) => void;
  destroy?: () => void;
};

type MapglModule = {
  Map: new (
    container: HTMLElement,
    options: {
      key: string;
      center: [number, number];
      zoom: number;
    },
  ) => MapglMap;
  Marker: new (
    map: MapglMap,
    options: {
      coordinates: [number, number];
      draggable?: boolean;
    },
  ) => MapglMarker;
};

declare global {
  interface Window {
    mapgl?: MapglModule;
  }
}

const ALMATY_CENTER = {
  latitude: 43.238949,
  longitude: 76.889709,
};

let mapglPromise: Promise<MapglModule> | null = null;

function toNumber(value: string | number | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function createInitialSelected(
  initialValue?: AddressPickerInitialValue,
): SelectedAddress | null {
  const latitude = toNumber(initialValue?.latitude);
  const longitude = toNumber(initialValue?.longitude);
  const addressLine = initialValue?.addressLine?.trim();

  if (!addressLine || latitude === null || longitude === null) {
    return null;
  }

  return {
    city: initialValue?.city?.trim() || "Алматы",
    addressLine,
    latitude,
    longitude,
    geoProvider: initialValue?.geoProvider?.trim() || "dev",
    geoProviderPlaceId: initialValue?.geoProviderPlaceId?.trim() || null,
    geoSource: initialValue?.geoSource?.trim() || "existing",
  };
}

function selectedToInputValue(selected: SelectedAddress | null) {
  return selected ? `${selected.city}, ${selected.addressLine}` : "";
}

function resultToSelected(result: GeocodeResult): SelectedAddress {
  return {
    city: result.city,
    addressLine: result.addressLine,
    latitude: Number(result.latitude),
    longitude: Number(result.longitude),
    geoProvider: result.provider,
    geoProviderPlaceId: result.providerPlaceId,
    geoSource: result.source,
  };
}

function loadMapgl() {
  if (window.mapgl) {
    return Promise.resolve(window.mapgl);
  }

  if (mapglPromise) {
    return mapglPromise;
  }

  mapglPromise = new Promise<MapglModule>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[data-deliver-mapgl="true"]',
    );

    if (existingScript) {
      existingScript.addEventListener("load", () => {
        if (window.mapgl) {
          resolve(window.mapgl);
        } else {
          reject(new Error("2GIS MapGL loaded without window.mapgl."));
        }
      });
      existingScript.addEventListener("error", () => {
        reject(new Error("2GIS MapGL failed to load."));
      });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://mapgl.2gis.com/api/js/v1";
    script.async = true;
    script.defer = true;
    script.dataset.deliverMapgl = "true";
    script.addEventListener("load", () => {
      if (window.mapgl) {
        resolve(window.mapgl);
      } else {
        reject(new Error("2GIS MapGL loaded without window.mapgl."));
      }
    });
    script.addEventListener("error", () => {
      reject(new Error("2GIS MapGL failed to load."));
    });
    document.head.appendChild(script);
  });

  return mapglPromise;
}

function readMapClickCoordinates(event: unknown) {
  const eventRecord = event as {
    lngLat?: unknown;
    coordinates?: unknown;
  };
  const rawCoordinates = eventRecord.lngLat ?? eventRecord.coordinates;

  if (Array.isArray(rawCoordinates) && rawCoordinates.length >= 2) {
    const longitude = Number(rawCoordinates[0]);
    const latitude = Number(rawCoordinates[1]);

    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      return { latitude, longitude };
    }
  }

  if (rawCoordinates && typeof rawCoordinates === "object") {
    const point = rawCoordinates as {
      lat?: number;
      lng?: number;
      lon?: number;
      latitude?: number;
      longitude?: number;
    };
    const latitude = Number(point.lat ?? point.latitude);
    const longitude = Number(point.lng ?? point.lon ?? point.longitude);

    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      return { latitude, longitude };
    }
  }

  return null;
}

export function AddressPicker({
  initialValue,
  mapApiKey,
  searchLabel = "Адрес",
}: AddressPickerProps) {
  const initialSelected = useMemo(
    () => createInitialSelected(initialValue),
    [initialValue],
  );
  const [query, setQuery] = useState(selectedToInputValue(initialSelected));
  const [selected, setSelected] = useState<SelectedAddress | null>(initialSelected);
  const [suggestions, setSuggestions] = useState<GeoSuggestion[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapglRef = useRef<MapglModule | null>(null);
  const mapRef = useRef<MapglMap | null>(null);
  const markerRef = useRef<MapglMarker | null>(null);

  const selectPointFromMap = useCallback(
    async (latitude: number, longitude: number) => {
      setStatus("loading");
      setMessage(null);

      try {
        const response = await fetch("/api/geo/reverse", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ latitude, longitude }),
        });
        const payload = (await response.json()) as GeocodeResponse;

        if (!response.ok || !payload.result) {
          setStatus("error");
          setMessage("Эта точка вне зоны сервиса.");
          return;
        }

        const nextSelected = resultToSelected(payload.result);
        setSelected(nextSelected);
        setQuery(selectedToInputValue(nextSelected));
        setStatus("idle");
      } catch {
        setStatus("error");
        setMessage("Не удалось уточнить точку.");
      }
    },
    [],
  );

  useEffect(() => {
    const trimmedQuery = query.trim();

    if (trimmedQuery.length < 2) {
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/geo/suggest?q=${encodeURIComponent(trimmedQuery)}`,
          {
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as SuggestResponse;
        setSuggestions(payload.suggestions ?? []);
      } catch {
        if (!controller.signal.aborted) {
          setSuggestions([]);
        }
      }
    }, 250);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [query]);

  useEffect(() => {
    if (!mapApiKey || !mapContainerRef.current || mapRef.current) {
      return;
    }

    let cancelled = false;
    const center = selected
      ? ([selected.longitude, selected.latitude] as [number, number])
      : ([ALMATY_CENTER.longitude, ALMATY_CENTER.latitude] as [number, number]);

    loadMapgl()
      .then((mapgl) => {
        if (cancelled || !mapContainerRef.current) {
          return;
        }

        mapglRef.current = mapgl;
        const map = new mapgl.Map(mapContainerRef.current, {
          key: mapApiKey,
          center,
          zoom: selected ? 16 : 12,
        });
        map.on?.("click", (event) => {
          const point = readMapClickCoordinates(event);

          if (point) {
            void selectPointFromMap(point.latitude, point.longitude);
          }
        });
        mapRef.current = map;
      })
      .catch(() => {
        setMessage("Карта 2GIS недоступна. Проверьте публичный ключ карты.");
      });

    return () => {
      cancelled = true;
    };
  }, [mapApiKey, selectPointFromMap, selected]);

  useEffect(() => {
    if (!selected || !mapRef.current || !mapglRef.current) {
      return;
    }

    const coordinates: [number, number] = [selected.longitude, selected.latitude];
    mapRef.current.setCenter?.(coordinates);
    mapRef.current.setZoom?.(16);

    if (markerRef.current?.setCoordinates) {
      markerRef.current.setCoordinates(coordinates);
    } else {
      markerRef.current?.destroy?.();
      markerRef.current = new mapglRef.current.Marker(mapRef.current, {
        coordinates,
        draggable: true,
      });
    }
  }, [selected]);

  useEffect(() => {
    return () => {
      markerRef.current?.destroy?.();
      mapRef.current?.destroy?.();
    };
  }, []);

  async function selectSuggestion(suggestion: GeoSuggestion) {
    setStatus("loading");
    setMessage(null);
    setSuggestions([]);
    setQuery(suggestion.title);

    try {
      const response = await fetch("/api/geo/geocode", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          city: suggestion.city,
          addressLine: suggestion.addressLine,
          providerPlaceId: suggestion.providerPlaceId,
        }),
      });
      const payload = (await response.json()) as GeocodeResponse;

      if (!response.ok || !payload.result) {
        setStatus("error");
        setSelected(null);
        setMessage("Адрес вне зоны сервиса или не найден.");
        return;
      }

      const nextSelected = resultToSelected(payload.result);
      setSelected(nextSelected);
      setQuery(selectedToInputValue(nextSelected));
      setStatus("idle");
    } catch {
      setStatus("error");
      setSelected(null);
      setMessage("Не удалось определить адрес.");
    }
  }

  const visibleSuggestions = !selected && query.trim().length >= 2 ? suggestions : [];

  return (
    <div className="grid gap-3">
      <input name="city" type="hidden" value={selected?.city ?? "Алматы"} />
      <input name="addressLine" type="hidden" value={selected?.addressLine ?? ""} />
      <input
        name="latitude"
        type="hidden"
        value={selected ? selected.latitude.toFixed(6) : ""}
      />
      <input
        name="longitude"
        type="hidden"
        value={selected ? selected.longitude.toFixed(6) : ""}
      />
      <input name="geoProvider" type="hidden" value={selected?.geoProvider ?? ""} />
      <input
        name="geoProviderPlaceId"
        type="hidden"
        value={selected?.geoProviderPlaceId ?? ""}
      />
      <input name="geoSource" type="hidden" value={selected?.geoSource ?? ""} />

      <label className="grid gap-2 text-sm">
        <span className="font-medium">{searchLabel}</span>
        <input
          value={query}
          onChange={(event) => {
            const nextQuery = event.target.value;
            setQuery(nextQuery);
            setSelected(null);
            setMessage(null);
            if (nextQuery.trim().length < 2) {
              setSuggestions([]);
            }
          }}
          maxLength={240}
          placeholder="проспект Абая, 10"
          className="h-11 rounded-md border border-border bg-background px-3 outline-none focus:border-accent"
        />
      </label>

      {visibleSuggestions.length > 0 ? (
        <div className="grid overflow-hidden rounded-md border border-border bg-background">
          {visibleSuggestions.map((suggestion) => (
            <button
              key={suggestion.id}
              type="button"
              onClick={() => void selectSuggestion(suggestion)}
              className="grid gap-1 border-b border-border px-3 py-2 text-left text-sm transition-colors last:border-b-0 hover:bg-surface-muted"
            >
              <span className="font-medium">{suggestion.title}</span>
              {suggestion.subtitle ? (
                <span className="text-xs text-foreground/55">
                  {suggestion.subtitle}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-md border border-border bg-background">
        {mapApiKey ? (
          <div ref={mapContainerRef} className="h-72 w-full" />
        ) : (
          <div className="grid h-72 place-items-center px-4 text-center text-sm text-foreground/60">
            Карта 2GIS подключится после добавления NEXT_PUBLIC_TWOGIS_MAP_KEY.
          </div>
        )}
      </div>

      {selected ? (
        <div className="rounded-md border border-accent/25 bg-accent/10 px-3 py-2 text-sm text-accent">
          {selected.city}, {selected.addressLine} ·{" "}
          {selected.latitude.toFixed(6)}, {selected.longitude.toFixed(6)}
        </div>
      ) : (
        <div className="rounded-md border border-warning/25 bg-warning/10 px-3 py-2 text-sm text-warning">
          Выберите адрес из подсказок или точку на карте.
        </div>
      )}

      {status === "loading" ? (
        <div className="text-sm text-foreground/55">Определяем адрес...</div>
      ) : null}
      {message ? <div className="text-sm text-warning">{message}</div> : null}
    </div>
  );
}
