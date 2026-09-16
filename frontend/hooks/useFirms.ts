"use client";

import { useCallback, useState } from "react";

import { api, apiErrorMessage } from "@/frontend/lib/api-client";
import type { FirePoint, FirmsStatus } from "@/frontend/types";

export type FirmsLoadStatus = FirmsStatus | "idle" | "failed";
export const FIRMS_REFRESH_MS = 30 * 60_000;

export function useFirms() {
  const [fires, setFires] = useState<FirePoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<FirmsLoadStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);

  const load = useCallback(async (days = 1) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.firms(days);
      setFires(res.fires);
      setStatus(res.status);
      setMessage(res.message);
      setCheckedAt(res.checked_at);
      setLoaded(true);
    } catch (error) {
      setStatus("failed");
      setMessage(null);
      setError(apiErrorMessage(error, "โหลดสัญญาณดาวเทียมไม่สำเร็จ"));
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    fires,
    loading,
    error,
    loaded,
    status,
    message,
    checkedAt,
    load,
  };
}
