"use client";

import { useCallback, useEffect, useState } from "react";

import { api, apiErrorMessage } from "@/frontend/lib/api-client";
import {
  cachedPublicValue,
  loadPublicData,
  PUBLIC_DATA_KEYS,
} from "@/frontend/lib/public-data-cache";
import type { StationsResponse } from "@/frontend/types";

// Browser reads Supabase-backed API only; it never polls Air4Thai directly.
const STATION_REFRESH_MS = 5 * 60 * 1000;
const STATION_CACHE_KEY = PUBLIC_DATA_KEYS.pm25;

const loadStations = (force = false) =>
  loadPublicData(STATION_CACHE_KEY, STATION_REFRESH_MS, api.pm25Current, force);

export function usePm25() {
  const [snapshot, setSnapshot] = useState<StationsResponse | null>(() =>
    cachedPublicValue(STATION_CACHE_KEY),
  );
  const [loading, setLoading] = useState(
    () => cachedPublicValue(STATION_CACHE_KEY) === null,
  );
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSnapshot(await loadStations(true));
    } catch (error) {
      setError(apiErrorMessage(error, "โหลดข้อมูล PM2.5 ไม่สำเร็จ"));
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshSilently = useCallback(async () => {
    try {
      setSnapshot(await loadStations());
      setError(null);
    } catch (error) {
      setError(apiErrorMessage(error, "โหลดข้อมูล PM2.5 ไม่สำเร็จ"));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await loadStations();
        if (!cancelled) setSnapshot(response);
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
  }, []);

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

  return {
    stations: snapshot?.stations ?? [],
    updatedAt: snapshot?.updated_at ?? null,
    counts: {
      fresh: snapshot?.fresh_count ?? 0,
      delayed: snapshot?.delayed_count ?? 0,
      expired: snapshot?.expired_count ?? 0,
    },
    loading,
    error,
    refresh,
  };
}
