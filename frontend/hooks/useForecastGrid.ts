"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, apiErrorMessage } from "@/frontend/lib/api-client";
import {
  forecastTimes,
  nearestTime,
  normalizeGridBounds,
  surfaceFor,
} from "@/frontend/lib/forecast-grid";
import type {
  ForecastGridMetadata,
  ForecastGridFrames,
} from "@/frontend/types";
import type { ViewportBounds } from "@/frontend/types/ui";

// Bounded cache: at most 12 windows of up to six nationwide frames (~few MB).
const cache = new Map<string, ForecastGridFrames>();
function remember(key: string, value: ForecastGridFrames) {
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > 12) cache.delete(cache.keys().next().value!);
}
export function useForecastGrid(
  enabled: boolean,
  active: boolean,
  viewport: ViewportBounds | null,
) {
  const [meta, setMeta] = useState<ForecastGridMetadata | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const previousMeta = useRef<ForecastGridMetadata | null>(null);
  const selectedRef = useRef<string | null>(null);
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);
  useEffect(() => {
    previousMeta.current = meta;
  }, [meta]);
  const [error, setError] = useState<string | null>(null);
  const [packet, setPacket] = useState<{
    key: string;
    data: ForecastGridFrames;
  } | null>(null);
  const [revision, reload] = useState(0);
  const visible = enabled && active;
  const playingRef = useRef(playing);
  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);
  const times = useMemo(() => (meta ? forecastTimes(meta) : []), [meta]);
  const at =
    selected && times.includes(selected) ? selected : (times[0] ?? null);
  const bbox = normalizeGridBounds(viewport);
  const bboxKey = JSON.stringify(bbox);
  useEffect(() => {
    if (!visible) return;
    let alive = true;
    const load = async () => {
      if (document.hidden || playingRef.current) return;
      try {
        const next = await api.forecastGridMetadata();
        if (!alive || playingRef.current) return;
        if (
          previousMeta.current?.generation_id &&
          next.generation_id !== previousMeta.current.generation_id
        ) {
          setNotice(
            selectedRef.current &&
              !forecastTimes(next).includes(selectedRef.current)
              ? "ชุดพยากรณ์ใหม่ไม่มีเวลาเดิม · เลื่อนไปเวลาที่ใกล้ที่สุด"
              : "อัปเดตชุดพยากรณ์แล้ว",
          );
        }
        setMeta(next);
        setSelected((old) =>
          nearestTime(
            forecastTimes(next),
            old ?? Math.floor(Date.now() / 3_600_000) * 3_600_000,
          ),
        );
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
  const bucketBoundary = at
    ? Math.floor(Date.parse(at) / (6 * 3_600_000)) * 6 * 3_600_000
    : 0;
  const bucketStart = at
    ? times.find((t) => Date.parse(t) >= bucketBoundary)
    : undefined;
  const windowTimes = bucketStart
    ? times
        .filter(
          (t) =>
            new Date(t).getTime() >= new Date(bucketStart).getTime() &&
            new Date(t).getTime() <=
              new Date(bucketStart).getTime() + 5 * 3_600_000,
        )
        .slice(0, 6)
    : [];
  // Bucket windows by their actual timestamp list, retaining the selected frame.
  const start = windowTimes[0],
    end = windowTimes.at(-1);
  const requestKey =
    visible && meta?.generation_id && bbox && start && end
      ? `${meta.generation_id}:${bboxKey}:${start}:${end}`
      : "";
  useEffect(() => {
    if (!requestKey || !meta?.generation_id || !start || !end) return;
    const bounds = JSON.parse(bboxKey) as ViewportBounds;
    let alive = true;
    const abort = new AbortController();
    const timer = window.setTimeout(() => {
      const hit = cache.get(requestKey);
      const load = hit
        ? Promise.resolve(hit)
        : api.forecastGridFrames(
            meta.generation_id!,
            start,
            end,
            bounds,
            abort.signal,
          );
      void load
        .then((data) => {
          if (!alive) return;
          if (
            data.generation_id !== meta.generation_id ||
            data.grid_version !== meta.grid_version ||
            data.rows < 2 ||
            data.columns < 2 ||
            data.frames.some(
              (f) => f.values.length !== data.rows * data.columns,
            )
          )
            throw Error("grid generation or geometry mismatch");
          remember(requestKey, data);
          setPacket({ key: requestKey, data });
          setError(null);
        })
        .catch((e) => {
          if (alive) {
            setPlaying(false);
            setError(
              apiErrorMessage(e, "โหลดช่วงพยากรณ์ไม่สำเร็จ กรุณาลองใหม่"),
            );
          }
        });
    }, 180);
    return () => {
      alive = false;
      clearTimeout(timer);
      abort.abort();
    };
  }, [
    requestKey,
    meta?.generation_id,
    meta?.grid_version,
    start,
    end,
    bboxKey,
    revision,
  ]);
  // During playback, prefetch just the next window. No background work while hidden/off.
  useEffect(() => {
    if (
      !playing ||
      !visible ||
      packet?.key !== requestKey ||
      !meta?.generation_id ||
      !end ||
      !bbox
    )
      return;
    const nextStart = times.find((t) => Date.parse(t) > Date.parse(end));
    const next = nextStart
      ? times
          .filter(
            (t) =>
              Date.parse(t) >= Date.parse(nextStart) &&
              Date.parse(t) <= Date.parse(nextStart) + 5 * 3_600_000,
          )
          .slice(0, 6)
      : [];
    if (!next.length) return;
    const key = `${meta.generation_id}:${bboxKey}:${next[0]}:${next.at(-1)}`;
    if (cache.has(key)) return;
    const abort = new AbortController();
    let alive = true;
    void api
      .forecastGridFrames(
        meta.generation_id,
        next[0],
        next.at(-1)!,
        bbox,
        abort.signal,
      )
      .then((data) => {
        if (alive && data.generation_id === meta.generation_id)
          remember(key, data);
      })
      .catch(() => {});
    return () => {
      alive = false;
      abort.abort();
    };
    // Bounds are represented by bboxKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    playing,
    visible,
    packet,
    requestKey,
    meta?.generation_id,
    end,
    bboxKey,
    times,
  ]);
  // Reuse a prefetched window containing this timestamp, independent of slider request key.
  const cached =
    visible && at && meta?.generation_id
      ? [...cache.entries()]
          .reverse()
          .find(
            ([key, value]) =>
              key.startsWith(`${meta.generation_id}:${bboxKey}:`) &&
              value.frames.some(
                (f) =>
                  new Date(f.valid_at).getTime() === new Date(at).getTime(),
              ),
          )?.[1]
      : undefined;
  const data = packet?.key === requestKey ? packet.data : cached;
  const surface = useMemo(
    () => (visible && at && meta && data ? surfaceFor(meta, data, at) : null),
    [visible, at, meta, data],
  );
  const noFrame = Boolean(visible && at && data && !surface);
  const loading =
    visible &&
    !error &&
    (!meta ||
      (meta.status === "ready" && Boolean(bbox) && !surface && !noFrame));
  useEffect(() => {
    if (!visible || !playing || !surface || error) return;
    const timer = window.setTimeout(() => {
      const index = times.indexOf(at!);
      if (index >= times.length - 1) setPlaying(false);
      else setSelected(times[index + 1]);
    }, 1400);
    return () => clearTimeout(timer);
  }, [visible, playing, surface, at, times, error]);
  useEffect(() => {
    const pause = () => {
      if (document.hidden) setPlaying(false);
    };
    document.addEventListener("visibilitychange", pause);
    return () => document.removeEventListener("visibilitychange", pause);
  }, []);
  const pause = useCallback(() => setPlaying(false), []);
  useEffect(() => {
    if (visible) return;
    const frame = requestAnimationFrame(pause);
    return () => cancelAnimationFrame(frame);
  }, [visible, pause]);
  const choose = useCallback((value: string) => {
    setPlaying(false);
    setSelected(value);
  }, []);
  const goNow = useCallback(() => choose(times[0] ?? ""), [choose, times]);
  return {
    meta,
    notice,
    times,
    at,
    surface,
    noFrame,
    loading,
    error,
    playing: playing && visible,
    select: choose,
    pause,
    togglePlay: () => {
      if (playing) {
        setPlaying(false);
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
      setPlaying((v) => !v);
    },
    now: goNow,
    retry: () => reload((v) => v + 1),
    unavailable: meta?.status === "unavailable",
    outOfBounds: !bbox,
  };
}
