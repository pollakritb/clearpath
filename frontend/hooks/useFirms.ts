"use client";

import { useCallback, useState } from "react";

import { api, apiErrorMessage } from "@/frontend/lib/api-client";
import {
  cachedPublicValue,
  loadPublicData,
} from "@/frontend/lib/public-data-cache";
import type { FirmsResponse, FirmsStatus } from "@/frontend/types";

export type FirmsLoadStatus = FirmsStatus | "idle" | "failed";
export const FIRMS_REFRESH_MS = 30 * 60_000;

export function useFirms() {
  const [snapshot, setSnapshot] = useState<FirmsResponse | null>(() =>
    cachedPublicValue("firms:1"),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async (days = 1, force = false) => {
    const key = `firms:${days}`;
    const cached = force ? null : cachedPublicValue<FirmsResponse>(key);
    if (cached) {
      setSnapshot(cached);
      setFailed(false);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setSnapshot(
        await loadPublicData(
          key,
          FIRMS_REFRESH_MS,
          () => api.firms(days),
          force,
        ),
      );
      setFailed(false);
    } catch (error) {
      setFailed(true);
      setError(apiErrorMessage(error, "โหลดสัญญาณดาวเทียมไม่สำเร็จ"));
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    fires: snapshot?.fires ?? [],
    loading,
    error,
    loaded: snapshot !== null,
    status: (failed
      ? "failed"
      : (snapshot?.status ?? "idle")) as FirmsLoadStatus,
    message: failed ? null : (snapshot?.message ?? null),
    checkedAt: snapshot?.checked_at ?? null,
    load,
  };
}
