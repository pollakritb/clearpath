"use client";

import { useCallback, useState } from "react";

import { api, ApiError } from "@/frontend/lib/api-client";
import type { Weather } from "@/frontend/types";

export function useWeather() {
  const [data, setData] = useState<Weather | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (lat: number, lon: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.weather(lat, lon);
      setData(res);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "โหลดสภาพอากาศไม่สำเร็จ");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, loading, error, load };
}
