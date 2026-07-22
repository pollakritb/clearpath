"use client";

import { useCallback, useState } from "react";

import { api, apiErrorMessage } from "@/frontend/lib/api-client";
import type { ForecastResponse } from "@/frontend/types";

export function useForecast() {
  const [data, setData] = useState<ForecastResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (stationId: string, hours = 12) => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.forecast(stationId, hours);
      setData(result);
    } catch (error) {
      setData(null);
      setError(apiErrorMessage(error, "พยากรณ์ PM2.5 ไม่สำเร็จ"));
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, loading, error, load };
}
