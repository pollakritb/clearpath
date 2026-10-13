"use client";

import { useCallback, useState } from "react";

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

  const load = useCallback(
    async (stationId: string, hours = 12, force = false) => {
      const key = `forecast:${stationId}:${hours}`;
      const cached = force ? null : cachedPublicValue<ForecastResponse>(key);
      if (cached) {
        setData(cached);
        setError(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const result = await loadPublicData(
          key,
          FORECAST_CACHE_MS,
          () => api.forecast(stationId, hours),
          force,
        );
        setData(result);
      } catch (error) {
        setData(null);
        setError(apiErrorMessage(error, "พยากรณ์ PM2.5 ไม่สำเร็จ"));
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { data, loading, error, load };
}
