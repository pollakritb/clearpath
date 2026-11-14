"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { api, ApiError, apiErrorMessage } from "@/frontend/lib/api-client";
import {
  cachedPublicValue,
  loadPublicData,
  invalidatePublicData,
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
      hours = 120,
      force = false,
      generationId?: string,
    ) => {
      const targetKey =
        typeof target === "string"
          ? `station:${target}`
          : `area:${target.lat.toFixed(2)}:${target.lon.toFixed(2)}`;
      const key = `forecast:${targetKey}:${hours}:${generationId ?? "active"}`;
      const serial = ++requestSerial.current;
      const cached = force ? null : cachedPublicValue<ForecastResponse>(key);
      const expired =
        cached?.expires_at && Date.now() >= Date.parse(cached.expires_at);
      if (cached && !expired) {
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
          async () => {
            try {
              return await api.forecast(target, hours, generationId);
            } catch (error) {
              if (
                !generationId ||
                !(error instanceof ApiError) ||
                error.status !== 410
              )
                throw error;
              invalidatePublicData(key);
              const meta = await api.forecastGridMetadata();
              if (meta.status !== "ready" || !meta.generation_id) throw error;
              return api.forecast(target, hours, meta.generation_id);
            }
          },
          force || !!expired,
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

  useEffect(() => {
    if (!data?.expires_at) return;
    const expire = () => setData(null);
    const timer = setTimeout(
      expire,
      Math.max(0, Date.parse(data.expires_at) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [data]);

  return { data, loading, error, load };
}
