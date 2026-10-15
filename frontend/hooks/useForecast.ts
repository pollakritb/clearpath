"use client";

import { useCallback, useRef, useState } from "react";

import { api, apiErrorMessage } from "@/frontend/lib/api-client";
import {
  cachedPublicValue,
  loadPublicData,
} from "@/frontend/lib/public-data-cache";
import type { ForecastResponse } from "@/frontend/types";

const FORECAST_CACHE_MS = 10 * 60_000;

export function useForecast() {
  const [data, setData] = useState<ForecastResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSerial = useRef(0);

  const load = useCallback(
    async (
      target: string | { lat: number; lon: number },
      hours = 12,
      force = false,
    ) => {
      const targetKey =
        typeof target === "string"
          ? `station:${target}`
          : `area:${target.lat.toFixed(2)}:${target.lon.toFixed(2)}`;
      const key = `forecast:${targetKey}:${hours}`;
      const serial = ++requestSerial.current;
      const cached = force ? null : cachedPublicValue<ForecastResponse>(key);
      if (cached) {
        setData(cached);
        setError(null);
        setLoading(false);
        return;
      }
      setData(null);
      setLoading(true);
      setError(null);
      try {
        const result = await loadPublicData(
          key,
          FORECAST_CACHE_MS,
          () => api.forecast(target, hours),
          force,
        );
        if (serial === requestSerial.current) setData(result);
      } catch (error) {
        if (serial === requestSerial.current) {
          setData(null);
          setError(apiErrorMessage(error, "พยากรณ์ PM2.5 ไม่สำเร็จ"));
        }
      } finally {
        if (serial === requestSerial.current) setLoading(false);
      }
    },
    [],
  );

  return { data, loading, error, load };
}
