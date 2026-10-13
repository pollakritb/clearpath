"use client";

import { useCallback, useState } from "react";

import { api, apiErrorMessage } from "@/frontend/lib/api-client";
import {
  cachedPublicValue,
  loadPublicData,
} from "@/frontend/lib/public-data-cache";
import type { Weather } from "@/frontend/types";

const WEATHER_CACHE_MS = 10 * 60_000;

export function useWeather() {
  const [data, setData] = useState<Weather | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (lat: number, lon: number, force = false) => {
    const key = `weather:${lat.toFixed(4)}:${lon.toFixed(4)}`;
    const cached = force ? null : cachedPublicValue<Weather>(key);
    if (cached) {
      setData(cached);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await loadPublicData(
        key,
        WEATHER_CACHE_MS,
        () => api.weather(lat, lon),
        force,
      );
      setData(res);
    } catch (error) {
      setError(apiErrorMessage(error, "โหลดสภาพอากาศไม่สำเร็จ"));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, loading, error, load };
}
