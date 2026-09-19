"use client";

import { useEffect, useState } from "react";

import AppIcon from "@/frontend/components/ui/AppIcon";

interface MapHistoryControlsProps {
  offsetHours: number;
  targetAt: string | null;
  stationCount: number;
  loading: boolean;
  error: string | null;
  onOffsetChange: (hours: number) => void;
  onReturnCurrent: () => void;
}

function formatTarget(value: string | null) {
  if (!value) return "กำลังเตรียมข้อมูลย้อนหลัง";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "ไม่ทราบช่วงเวลา";
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function MapHistoryControls({
  offsetHours,
  targetAt,
  stationCount,
  loading,
  error,
  onOffsetChange,
  onReturnCurrent,
}: MapHistoryControlsProps) {
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing || offsetHours <= 1) return;
    const timer = window.setTimeout(() => {
      const nextOffset = offsetHours - 1;
      onOffsetChange(nextOffset);
      if (nextOffset <= 1) setPlaying(false);
    }, 1400);
    return () => window.clearTimeout(timer);
  }, [offsetHours, onOffsetChange, playing]);

  const timelineValue = 24 - offsetHours;
  return (
    <section className="cp-map-history-dock" aria-label="ดูค่าฝุ่นย้อนหลัง">
      <header className="cp-map-history-dock__heading">
        <span aria-hidden>
          <AppIcon name="clock" size={18} />
        </span>
        <div>
          <small>ค่าตรวจวัดย้อนหลัง</small>
          <strong>{formatTarget(targetAt)}</strong>
        </div>
        <button
          type="button"
          className="cp-map-history-dock__current cp-focus"
          onClick={onReturnCurrent}
        >
          ตอนนี้
        </button>
      </header>

      <div className="cp-map-history-dock__summary" aria-live="polite">
        <span>{loading ? "กำลังโหลด…" : `${stationCount} สถานี`}</span>
        <span>Air4Thai · ย้อนหลัง {offsetHours} ชม.</span>
      </div>

      <div className="cp-map-history-dock__timeline">
        <span>24 ชม.</span>
        <input
          type="range"
          min="0"
          max="23"
          step="1"
          value={timelineValue}
          aria-label="เลือกชั่วโมงย้อนหลัง"
          aria-valuetext={`ย้อนหลัง ${offsetHours} ชั่วโมง`}
          onChange={(event) => {
            setPlaying(false);
            onOffsetChange(24 - Number(event.target.value));
          }}
        />
        <span>1 ชม.</span>
      </div>

      <div className="cp-map-history-dock__actions">
        <button
          type="button"
          className="cp-focus"
          aria-label={playing ? "หยุดเล่นข้อมูลย้อนหลัง" : "เล่นข้อมูลย้อนหลัง"}
          onClick={() => {
            if (!playing && offsetHours <= 1) {
              onOffsetChange(24);
              setPlaying(true);
              return;
            }
            setPlaying((value) => !value);
          }}
        >
          <span aria-hidden>{playing ? "Ⅱ" : "▶"}</span>
          {playing ? "หยุด" : "เล่นตามเวลา"}
        </button>
        <p>
          {error ??
            (stationCount
              ? "แตะหมุดเพื่อดูค่าของสถานี ณ เวลานี้"
              : loading
                ? "กำลังค้นหาค่าตรวจวัด"
                : "ไม่มีข้อมูลสถานีในช่วงเวลานี้")}
        </p>
      </div>
    </section>
  );
}
