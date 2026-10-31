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
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    if (!userId || !active) return;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const now = Date.now();
      setClock(now);
      schedule(now);
    };
    const schedule = (now: number) => {
      const boundaries = (snapshot?.userId === userId ? snapshot.rows : [])
        .flatMap((row) => [
          Date.parse(row.starts_at),
          Date.parse(row.expires_at),
        ])
        .filter((at) => Number.isFinite(at) && at > now);
      const delay = boundaries.length
        ? Math.min(60000, Math.max(1, Math.min(...boundaries) - now + 1))
        : 60000;
      timer = setTimeout(tick, delay);
    };
    schedule(Date.now());
    const resume = () => {
      if (document.visibilityState !== "hidden") {
        clearTimeout(timer);
        tick();
      }
    };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("focus", resume);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("focus", resume);
    };
  }, [userId, active, snapshot]);
  useEffect(() => {
    if (!userId) return;
    const updated = (event: Event) => {
      const row = (event as CustomEvent<{ request?: MeasurementRequestView }>)
        .detail?.request;
      if (!row) return;
      sequence.current += 1;
      setSnapshot((previous) =>
        previous?.userId === userId
          ? {
              ...previous,
              rows: previous.rows.map((existing) =>
                existing.id === row.id
                  ? { ...existing, status: row.status, result: row.result }
                  : existing,
              ),
            }
          : previous,
      );
    };
    window.addEventListener(REQUESTS_CHANGED, updated);
    return () => window.removeEventListener(REQUESTS_CHANGED, updated);
  }, [userId]);
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
    window.addEventListener("cp-community-reset", changed);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", changed);
      window.removeEventListener("focus", changed);
      window.removeEventListener(REQUESTS_CHANGED, changed);
      window.removeEventListener("cp-community-reset", changed);
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
    now: Math.max(data?.now ?? 0, clock),
    failed: Boolean(userId && failedFor === userId),
    upsert,
  };
}
