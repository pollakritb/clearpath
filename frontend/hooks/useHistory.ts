"use client";

import { useCallback, useState } from "react";

import { api, ApiError } from "@/frontend/lib/api-client";
import type { HistoryPoint } from "@/frontend/types";

export function useHistory() {
  const [points, setPoints] = useState<HistoryPoint[]>([]);
  const [stationId, setStationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (id: string, hours = 24) => {
    setLoading(true);
    setError(null);
    setStationId(id);
    try {
      const res = await api.history(id, hours);
      setPoints(res.points);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "โหลดประวัติไม่สำเร็จ");
      setPoints([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    setPoints([]);
    setStationId(null);
    setError(null);
  }, []);

  return { points, stationId, loading, error, load, clear };
}
