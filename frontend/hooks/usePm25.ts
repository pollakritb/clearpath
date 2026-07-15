"use client";

import { useCallback, useEffect, useState } from "react";

import { api, ApiError } from "@/frontend/lib/api-client";
import type { Station } from "@/frontend/types";

export function usePm25() {
  const [stations, setStations] = useState<Station[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.pm25Current();
      setStations(res.stations);
      setUpdatedAt(res.updated_at);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "โหลดข้อมูล PM2.5 ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  // โหลดครั้งแรก — ใช้ async IIFE ที่ await ก่อน setState (เลี่ยง setState ตรงๆ ใน effect)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.pm25Current();
        if (cancelled) return;
        setStations(res.stations);
        setUpdatedAt(res.updated_at);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof ApiError ? e.message : "โหลดข้อมูล PM2.5 ไม่สำเร็จ");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { stations, updatedAt, loading, error, refresh };
}
