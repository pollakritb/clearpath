"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/frontend/lib/api-client";
import { REQUESTS_CHANGED } from "@/frontend/lib/measurement-events";
import type { MeasurementRequestView } from "@/frontend/types";

export function useMeasurementRequests(userId: string | null, active = true) {
  const [snapshot, setSnapshot] = useState<{
    userId: string;
    rows: MeasurementRequestView[];
    now: number;
  } | null>(null);
  const [failedFor, setFailedFor] = useState<string | null>(null);
  const sequence = useRef(0);
  useEffect(() => {
    if (!userId || !active) return;
    let alive = true;
    let pending = false;
    const refresh = async () => {
      if (pending || document.visibilityState === "hidden") return;
      pending = true;
      const current = ++sequence.current;
      try {
        const response = await api.measurementRequests();
        if (alive && current === sequence.current) {
          setSnapshot({ userId, rows: response.requests, now: Date.now() });
          setFailedFor(null);
        }
      } catch {
        if (alive && current === sequence.current) setFailedFor(userId);
      } finally {
        pending = false;
      }
    };
    const changed = () => {
      void refresh();
    };
    changed();
    const timer = window.setInterval(changed, 15000);
    document.addEventListener("visibilitychange", changed);
    window.addEventListener("focus", changed);
    window.addEventListener(REQUESTS_CHANGED, changed);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", changed);
      window.removeEventListener("focus", changed);
      window.removeEventListener(REQUESTS_CHANGED, changed);
    };
  }, [userId, active]);
  const upsert = useCallback(
    (row: MeasurementRequestView) => {
      if (!userId) return;
      sequence.current += 1; // Ignore an older in-flight list response after creation.
      const now = Date.now();
      setSnapshot((previous) => ({
        userId,
        now,
        rows: [
          row,
          ...(previous?.userId === userId
            ? previous.rows.filter((r) => r.id !== row.id)
            : []),
        ],
      }));
    },
    [userId],
  );
  const data = snapshot?.userId === userId ? snapshot : null;
  return {
    rows: data?.rows ?? [],
    now: data?.now ?? 0,
    failed: Boolean(userId && failedFor === userId),
    upsert,
  };
}
