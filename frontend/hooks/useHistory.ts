"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { api, apiErrorMessage } from "@/frontend/lib/api-client";
import type { HistoryPoint } from "@/frontend/types";

export function useHistory() {
  const sequence = useRef(0);
  const active = useRef<AbortController | null>(null);
  const [reference, setReference] = useState<number | null>(null);
  useEffect(
    () => () => {
      sequence.current++;
      active.current?.abort();
    },
    [],
  );
  const [points, setPoints] = useState<HistoryPoint[]>([]);
  const [stationId, setStationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (id: string, hours = 24) => {
    const request = ++sequence.current;
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    const end = Date.now();
    setReference(end);
    setPoints([]);
    setLoading(true);
    setError(null);
    setStationId(id);
    try {
      const res = await api.history(
        id,
        hours,
        new Date(end).toISOString(),
        controller.signal,
      );
      if (request !== sequence.current) return;
      setPoints(res.points);
    } catch (error) {
      if (request !== sequence.current) return;
      setError(apiErrorMessage(error, "โหลดประวัติไม่สำเร็จ"));
      setPoints([]);
    } finally {
      if (request === sequence.current) setLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    sequence.current++;
    active.current?.abort();
    setLoading(false);
    setReference(null);
    setPoints([]);
    setStationId(null);
    setError(null);
  }, []);

  return { reference, points, stationId, loading, error, load, clear };
}
