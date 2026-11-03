"use client";

import { useEffect, useMemo, useState } from "react";
import AppIcon from "@/frontend/components/ui/AppIcon";
import { api } from "@/frontend/lib/api-client";
import { loadPublicData } from "@/frontend/lib/public-data-cache";
import { classifyPm25 } from "@/frontend/lib/aqi";
import { formatForecastTime } from "@/frontend/lib/forecast-grid";
import {
  stationTimeAt,
  stationTimePosition,
  type StationTime,
  type StationTimeMode,
} from "@/frontend/lib/station-timeline";
import MapTimelineControls from "./MapTimelineControls";

export default function StationTimelineControls({
  time,
  mode,
  anchor,
  futureTimes: suppliedTimes,
  observedAt,
  station,
  loading,
  error,
  paused,
  onSelect,
  onClose,
}: {
  time: StationTime;
  mode: StationTimeMode;
  anchor: number;
  futureTimes: string[];
  observedAt?: string | null;
  station: { id: string; name: string; pm25: number | null } | null;
  loading: boolean;
  error: string | null;
  paused: boolean;
  onSelect: (time: StationTime) => void;
  onClose: () => void;
}) {
  const [available, setAvailable] = useState<string[]>([]);
  const [position, setPosition] = useState(mode === "history" ? 1 : 0);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!paused) return;
    const frame = requestAnimationFrame(() => setPlaying(false));
    return () => cancelAnimationFrame(frame);
  }, [paused]);
  useEffect(() => {
    const stop = () => {
      if (document.hidden) setPlaying(false);
    };
    document.addEventListener("visibilitychange", stop);
    return () => document.removeEventListener("visibilitychange", stop);
  }, []);
  useEffect(() => {
    if (mode !== "forecast") return;
    let alive = true;
    void loadPublicData("station-timeline-grid-metadata", 60_000, () =>
      api.forecastGridMetadata(),
    )
      .then((meta) => {
        if (alive) setAvailable(meta.valid_times);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [mode]);
  const futureTimes = useMemo(
    () =>
      [...new Set(suppliedTimes.length ? suppliedTimes : available)]
        .filter((at) => Date.parse(at) >= anchor)
        .sort((a, b) => Date.parse(a) - Date.parse(b)),
    [suppliedTimes, available, anchor],
  );
  // Keep the track stable while the asynchronously loaded forecast horizon changes.
  const steps = mode === "history" ? 24 : 120;
  const select = (next: StationTime) => {
    setPosition(stationTimePosition(next, futureTimes, mode));
    onSelect(next);
  };
  useEffect(() => {
    if (!playing || paused || loading || error) return;
    const frames: StationTime[] =
      mode === "history"
        ? [
            { kind: "current" },
            ...Array.from({ length: 24 }, (_, i) => ({
              kind: "history" as const,
              hours: i + 1,
            })),
          ]
        : futureTimes.map((at) => ({ kind: "forecast" as const, at }));
    const index = frames.findIndex(
      (frame) =>
        frame.kind === time.kind &&
        (frame.kind === "current" ||
          (frame.kind === "history" &&
            time.kind === "history" &&
            frame.hours === time.hours) ||
          (frame.kind === "forecast" &&
            time.kind === "forecast" &&
            frame.at === time.at)),
    );
    const timer = window.setTimeout(() => {
      const next = frames[index + 1];
      if (!next) {
        setPlaying(false);
        return;
      }
      setPosition(stationTimePosition(next, futureTimes, mode));
      onSelect(next);
    }, 1400);
    return () => window.clearTimeout(timer);
  }, [playing, paused, loading, error, time, futureTimes, onSelect, mode]);
  const at =
    time.kind === "history"
      ? !loading && observedAt
        ? observedAt
        : new Date(anchor - time.hours * 3600000).toISOString()
      : time.kind === "forecast"
        ? time.at
        : null;
  const nowTime: StationTime =
    mode === "history"
      ? { kind: "current" }
      : {
          kind: "forecast",
          at: futureTimes[0] ?? new Date(anchor).toISOString(),
        };
  const isNow =
    time.kind === "current" ||
    (time.kind === "forecast" && Date.parse(time.at) === anchor);
  const source =
    time.kind === "forecast"
      ? "CAMS · ค่าพยากรณ์"
      : time.kind === "history"
        ? "Air4Thai · ค่าตรวจวัดย้อนหลัง"
        : "Air4Thai · ค่าตรวจวัดล่าสุด";
  const classification = classifyPm25(loading || error ? null : station?.pm25);
  return (
    <div
      className="cp-history-timeline-host cp-station-time-panel"
      hidden={paused}
    >
      <MapTimelineControls
        title={mode === "history" ? "ค่าตรวจวัดย้อนหลัง" : "พยากรณ์ค่าฝุ่น"}
        time={isNow ? "ตอนนี้" : at ? formatForecastTime(at) : "ตอนนี้"}
        value={position * steps}
        max={steps}
        rangeLabel={
          mode === "history"
            ? "เลือกชั่วโมงย้อนหลัง"
            : "เลือกเวลาพยากรณ์ของสถานี"
        }
        valueText={
          time.kind === "history"
            ? `ย้อนหลัง ${time.hours} ชั่วโมง · Air4Thai`
            : time.kind === "forecast"
              ? `พยากรณ์ ${formatForecastTime(time.at)} · CAMS`
              : "ตอนนี้ · Air4Thai"
        }
        startLabel={
          mode === "history" ? "Air4Thai · ย้อนหลัง 24 ชม." : "ตอนนี้"
        }
        endLabel={
          mode === "history"
            ? "ตอนนี้"
            : futureTimes.length
              ? `CAMS · ถึง ${formatForecastTime(futureTimes.at(-1)!)}`
              : "CAMS · ยังไม่มีพยากรณ์"
        }
        playing={playing && !paused}
        disabled={paused || loading || !!error}
        onPlay={() => setPlaying((v) => !v)}
        onChange={(value) => {
          setPlaying(false);
          const pos = value / steps;
          if (mode === "forecast" && !futureTimes.length) return;
          setPosition(pos);
          onSelect(stationTimeAt(pos, futureTimes, mode));
        }}
        onNow={() => {
          setPlaying(false);
          select(nowTime);
        }}
        summary={loading ? `${source} · กำลังโหลด…` : source}
        error={error}
        endAction={
          <button
            type="button"
            className="cp-station-time-close cp-focus"
            aria-label="ปิดแถบเวลา"
            onClick={onClose}
          >
            <AppIcon name="close" size={17} />
          </button>
        }
        detail={
          <>
            {station && (
              <section
                className="cp-history-station"
                aria-label="สถานีที่ติดตามตามเวลา"
                style={
                  {
                    "--cp-history-color": classification.color,
                    "--cp-history-tint": classification.tint,
                  } as React.CSSProperties
                }
              >
                <div>
                  <small>สถานีที่เลือก · {station.id}</small>
                  <strong>{station.name}</strong>
                  {!loading && !error && station.pm25 == null && (
                    <small>ไม่มีข้อมูลสถานีนี้ในเวลาที่เลือก</small>
                  )}
                </div>
                <p aria-live="polite">
                  <b>{loading || error ? "—" : (station.pm25 ?? "—")}</b>
                  <small>µg/m³</small>
                </p>
              </section>
            )}
          </>
        }
      />
    </div>
  );
}
