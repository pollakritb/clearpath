"use client";
import { useEffect, useState } from "react";
import MapTimelineControls from "./MapTimelineControls";
import { formatForecastTime } from "@/frontend/lib/forecast-grid";

export default function MapHistoryControls({
  offsetHours,
  targetAt,
  stationCount,
  reportCount = 0,
  loading,
  error,
  onOffsetChange,
  onReturnCurrent,
  paused = false,
}: {
  offsetHours: number;
  targetAt: string | null;
  stationCount: number;
  reportCount?: number;
  loading: boolean;
  error: string | null;
  onOffsetChange: (hours: number) => void;
  onReturnCurrent: () => void;
  paused?: boolean;
}) {
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!paused) return;
    const frame = requestAnimationFrame(() => setPlaying(false));
    return () => cancelAnimationFrame(frame);
  }, [paused]);
  useEffect(() => {
    if (!playing || paused || loading || error || offsetHours <= 1) return;
    const timer = setTimeout(() => {
      const next = offsetHours - 1;
      onOffsetChange(next);
      if (next <= 1) setPlaying(false);
    }, 1400);
    return () => clearTimeout(timer);
  }, [offsetHours, onOffsetChange, playing, paused, loading, error]);
  return (
    <div className="cp-history-timeline-host" hidden={paused}>
      <MapTimelineControls
        title="ค่าตรวจวัดย้อนหลัง"
        time={
          targetAt ? formatForecastTime(targetAt) : "กำลังเตรียมข้อมูลย้อนหลัง"
        }
        value={24 - offsetHours}
        max={23}
        rangeLabel="เลือกชั่วโมงย้อนหลัง"
        valueText={`ย้อนหลัง ${offsetHours} ชั่วโมง`}
        startLabel="24 ชม."
        endLabel="1 ชม."
        playing={playing && !paused}
        disabled={paused || (!playing && (loading || !!error))}
        onPlay={() => {
          if (!playing && offsetHours <= 1) {
            onOffsetChange(24);
            setPlaying(true);
          } else setPlaying((v) => !v);
        }}
        onChange={(v) => {
          setPlaying(false);
          onOffsetChange(24 - v);
        }}
        onNow={() => {
          setPlaying(false);
          onReturnCurrent();
        }}
        summary={
          loading
            ? "กำลังโหลด…"
            : `${stationCount} สถานี · ${reportCount} รายงาน`
        }
        error={error}
      />
    </div>
  );
}
