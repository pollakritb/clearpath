"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, apiErrorMessage } from "@/frontend/lib/api-client";
import {
  forecastTimes,
  nearestTime,
  normalizeGridBounds,
  surfaceFor,
} from "@/frontend/lib/forecast-grid";
import {
  cachedGridWindow,
  gridWindow,
  gridWindows,
  loadGridWindow,
  preparedGridFrames,
} from "@/frontend/lib/forecast-grid-cache";
import type {
  ForecastGridMetadata,
  ForecastGridFrames,
} from "@/frontend/types";
import type { ViewportBounds } from "@/frontend/types/ui";

export function useForecastGrid(
  enabled: boolean,
  active: boolean,
  viewport: ViewportBounds | null,
) {
  const [meta, setMeta] = useState<ForecastGridMetadata | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [packet, setPacket] = useState<{
    data: ForecastGridFrames;
    at: string;
  } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revision, reload] = useState(0);
  const [, cacheChanged] = useState(0);
  const previousMeta = useRef<ForecastGridMetadata | null>(null);
  const selectedRef = useRef<string | null>(null),
    playingRef = useRef(playing);
  useEffect(() => {
    previousMeta.current = meta;
    selectedRef.current = selected;
    playingRef.current = playing;
  }, [meta, selected, playing]);
  const visible = enabled && active;
  const times = useMemo(() => (meta ? forecastTimes(meta) : []), [meta]);
  const requestedAt =
    selected && times.includes(selected) ? selected : (times[0] ?? null);
  const outOfBounds = !normalizeGridBounds(viewport);
  useEffect(() => {
    if (!visible) return;
    let alive = true;
    const load = async () => {
      if (document.hidden || playingRef.current) return;
      try {
        const next = await api.forecastGridMetadata();
        if (!alive || playingRef.current) return;
        const target = nearestTime(
          forecastTimes(next),
          selectedRef.current ?? Math.floor(Date.now() / 3600000) * 3600000,
        );
        const changed =
          previousMeta.current?.generation_id &&
          next.generation_id !== previousMeta.current.generation_id;
        // Keep the old generation whole until the selected new frame is ready.
        const first =
          changed && target && next.status === "ready"
            ? await loadGridWindow(next, gridWindow(next, target))
            : null;
        if (!alive || playingRef.current) return;
        if (changed)
          setNotice(
            selectedRef.current &&
              !forecastTimes(next).includes(selectedRef.current)
              ? "ชุดพยากรณ์ใหม่ไม่มีเวลาเดิม · เลื่อนไปเวลาที่ใกล้ที่สุด"
              : "อัปเดตชุดพยากรณ์แล้ว",
          );
        if (first && target) setPacket({ data: first, at: target });
        setMeta(next);
        setSelected(target);
        setError(null);
      } catch (e) {
        if (alive) setError(apiErrorMessage(e, "โหลดพยากรณ์ไม่สำเร็จ"));
      }
    };
    void load();
    document.addEventListener("visibilitychange", load);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", load);
    };
  }, [visible, revision]);
  useEffect(() => {
    if (!visible || !meta?.generation_id || !requestedAt) return;
    let alive = true;
    const timer = setTimeout(() => {
      void loadGridWindow(meta, gridWindow(meta, requestedAt))
        .then((data) => {
          if (alive) {
            setPacket({ data, at: requestedAt });
            setError(null);
          }
        })
        .catch((e) => {
          if (alive) {
            setPlaying(false);
            setError(
              apiErrorMessage(e, "โหลดช่วงพยากรณ์ไม่สำเร็จ กรุณาลองใหม่"),
            );
          }
        });
    }, 80);
    // An obsolete request may finish into the bounded cache, but never change selection.
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [visible, meta, requestedAt, revision]);
  useEffect(() => {
    if (!visible || !meta?.generation_id) return;
    let alive = true;
    const prepare = async () => {
      const target = nearestTime(
        forecastTimes(meta),
        selectedRef.current ?? Math.floor(Date.now() / 3600000) * 3600000,
      );
      if (!target) return;
      try {
        await loadGridWindow(meta, gridWindow(meta, target));
      } catch {
        return;
      }
      if (!alive) return;
      cacheChanged((v) => v + 1);
      const windows = gridWindows(meta).filter(
        (w) =>
          w.some((at) => times.includes(at)) && !cachedGridWindow(meta, w[0]),
      );
      windows.sort(
        (a, b) =>
          Math.abs(Date.parse(a[0]) - Date.parse(target)) -
          Math.abs(Date.parse(b[0]) - Date.parse(target)),
      );
      // Two small requests at a time; warm the entire horizon even before playback.
      const worker = async () => {
        while (alive && windows.length) {
          const window = windows.shift()!;
          try {
            await loadGridWindow(meta, window);
            if (alive) cacheChanged((v) => v + 1);
          } catch {
            /* foreground selection exposes errors and supports retry */
          }
        }
      };
      await Promise.all([worker(), worker()]);
    };
    void prepare();
    // Already-started reads can complete into cache; no further prefetch starts after cleanup.
    return () => {
      alive = false;
    };
  }, [visible, meta, revision, times]);
  const data =
    meta && requestedAt ? cachedGridWindow(meta, requestedAt) : undefined;
  const surface = useMemo(() => {
    if (!visible || !meta || !requestedAt) return null;
    if (data) return surfaceFor(meta, data, requestedAt);
    return packet ? surfaceFor(meta, packet.data, packet.at) : null;
  }, [visible, meta, requestedAt, data, packet]);
  const at = surface?.validAt ?? requestedAt;
  const pendingAt = visible && requestedAt && !data ? requestedAt : null;
  const noFrame = Boolean(visible && data && requestedAt && !surface);
  const loading =
    visible &&
    !error &&
    (!meta || (meta.status === "ready" && !data && !surface));
  const rememberSelection = useCallback(
    (value: string) => {
      setSelected(value);
      const hit = meta ? cachedGridWindow(meta, value) : undefined;
      if (hit) setPacket({ data: hit, at: value });
    },
    [meta],
  );
  const pause = useCallback(() => setPlaying(false), []);
  const choose = useCallback(
    (value: string) => {
      pause();
      rememberSelection(value);
    },
    [pause, rememberSelection],
  );
  useEffect(() => {
    if (!visible || !playing || !surface || pendingAt || error) return;
    const timer = setTimeout(() => {
      const i = times.indexOf(at!);
      if (i >= times.length - 1) setPlaying(false);
      else rememberSelection(times[i + 1]);
    }, 1400);
    return () => clearTimeout(timer);
  }, [
    visible,
    playing,
    surface,
    pendingAt,
    error,
    times,
    at,
    rememberSelection,
  ]);
  useEffect(() => {
    const stop = () => {
      if (document.hidden) pause();
    };
    document.addEventListener("visibilitychange", stop);
    return () => document.removeEventListener("visibilitychange", stop);
  }, [pause]);
  useEffect(() => {
    if (visible) return;
    const frame = requestAnimationFrame(pause);
    return () => cancelAnimationFrame(frame);
  }, [visible, pause]);
  const goNow = useCallback(() => choose(times[0] ?? ""), [choose, times]);
  const preparedFrames = meta ? preparedGridFrames(meta, times) : 0;
  const preloadSurfaces = useMemo(() => {
    if (!visible || !meta || !at || !preparedFrames) return [];
    return times
      .slice(times.indexOf(at) + 1, times.indexOf(at) + 3)
      .flatMap((time) => {
        const hit = cachedGridWindow(meta, time);
        const frame = hit ? surfaceFor(meta, hit, time) : null;
        return frame ? [frame] : [];
      });
  }, [visible, meta, at, times, preparedFrames]);
  return {
    preloadSurfaces,
    meta,
    notice,
    times,
    at,
    requestedAt,
    pendingAt,
    surface,
    noFrame,
    loading,
    error,
    preparedFrames,
    playing: playing && visible,
    select: choose,
    pause,
    togglePlay: () => {
      if (playing) {
        pause();
        return;
      }
      if (
        !visible ||
        loading ||
        error ||
        !at ||
        times.indexOf(at) === times.length - 1
      )
        return;
      setPlaying(true);
    },
    now: goNow,
    retry: () => {
      setError(null);
      reload((v) => v + 1);
    },
    unavailable: meta?.status === "unavailable",
    outOfBounds,
  };
}
