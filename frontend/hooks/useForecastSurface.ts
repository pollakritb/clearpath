"use client";

import { useCallback, useRef, useState } from "react";

import { api, apiErrorMessage } from "@/frontend/lib/api-client";
import { haversineKm } from "@/frontend/lib/idw";
import type { ForecastSurfaceResponse } from "@/frontend/types";
import type { ViewportBounds } from "@/frontend/types/ui";

export function useForecastSurface() {
  const [data, setData] = useState<ForecastSurfaceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);

  const load = useCallback(async (horizon: number, bounds: ViewportBounds) => {
    const requestId = ++request.current;
    if (
      haversineKm(
        bounds.min_lat,
        bounds.min_lon,
        bounds.max_lat,
        bounds.max_lon,
      ) > 500
    ) {
      setData(null);
      setLoading(false);
      setError(
        "กรุณาซูมเข้าให้พื้นที่แผนที่แคบกว่า 500 กม. เพื่อดูพื้นผิวพยากรณ์",
      );
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await api.forecastSurface(horizon, 12, bounds);
      if (request.current === requestId) setData(result);
    } catch (error) {
      if (request.current === requestId) {
        setData(null);
        setError(apiErrorMessage(error, "โหลดพื้นผิวพยากรณ์ไม่สำเร็จ"));
      }
    } finally {
      if (request.current === requestId) setLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    request.current += 1;
    setData(null);
    setError(null);
    setLoading(false);
  }, []);

  return { data, loading, error, load, clear };
}
