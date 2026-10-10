"use client";

import { useCallback, useEffect, useState } from "react";

import { api, apiErrorMessage } from "@/frontend/lib/api-client";
import type { Station, StationsResponse } from "@/frontend/types";

// Browser reads Supabase-backed API only; it never polls Air4Thai directly.
const STATION_REFRESH_MS = 5 * 60 * 1000;

export function usePm25() {
  const [stations, setStations] = useState<Station[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState({ fresh: 0, delayed: 0, expired: 0 });

  const applyResponse = useCallback((response: StationsResponse) => {
    setStations(response.stations);
    setUpdatedAt(response.updated_at);
    setCounts({
      fresh: response.fresh_count,
      delayed: response.delayed_count,
      expired: response.expired_count,
    });
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.pm25Current();
      applyResponse(res);
    } catch (error) {
      setError(apiErrorMessage(error, "โหลดข้อมูล PM2.5 ไม่สำเร็จ"));
    } finally {
      setLoading(false);
    }
  }, [applyResponse]);

  const refreshSilently = useCallback(async () => {
    try {
      applyResponse(await api.pm25Current());
      setError(null);
    } catch (error) {
      setError(apiErrorMessage(error, "โหลดข้อมูล PM2.5 ไม่สำเร็จ"));
    }
  }, [applyResponse]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await api.pm25Current();
        if (!cancelled) applyResponse(response);
      } catch (error) {
        if (!cancelled) {
          setError(apiErrorMessage(error, "โหลดข้อมูล PM2.5 ไม่สำเร็จ"));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyResponse]);

  useEffect(() => {
    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") void refreshSilently();
    };
    const timer = window.setInterval(refreshIfVisible, STATION_REFRESH_MS);
    document.addEventListener("visibilitychange", refreshIfVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [refreshSilently]);

  return { stations, updatedAt, counts, loading, error, refresh };
}
