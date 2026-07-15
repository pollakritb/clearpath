"use client";

import { useCallback, useState } from "react";

import { api, ApiError } from "@/frontend/lib/api-client";
import type { FirePoint } from "@/frontend/types";

export function useFirms() {
  const [fires, setFires] = useState<FirePoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async (days = 1) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.firms(days);
      setFires(res.fires);
      setLoaded(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "โหลดจุดไฟไหม้ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  return { fires, loading, error, loaded, load };
}
