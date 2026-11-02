"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import AppIcon from "@/frontend/components/ui/AppIcon";
import { useForecast } from "@/frontend/hooks/useForecast";
import { classifyPm25 } from "@/frontend/lib/aqi";
import {
  FORECAST_SOURCE_LABELS,
  formatForecastTime,
  formatForecastTimelineTime,
  formatProviderTime,
} from "@/frontend/lib/forecast-presentation";

import {
  FORECAST_PAUSED_MESSAGE,
  FORECAST_SYSTEM_PAUSED,
} from "@/frontend/lib/forecast-state";

export default function MapStationForecast({
  stationId,
  area,
}:
  | { stationId: string; area?: never }
  | { stationId?: never; area: { lat: number; lon: number } }) {
  const { data, loading, error, load } = useForecast();
  const [selectedAt, setSelectedAt] = useState<string | null>(null);
  const timeline = useRef<HTMLDivElement>(null);
  const areaLat = area?.lat;
  const areaLon = area?.lon;
  const target = useMemo(
    () => stationId ?? { lat: areaLat!, lon: areaLon! },
    [stationId, areaLat, areaLon],
  );
  useEffect(() => {
    if (!FORECAST_SYSTEM_PAUSED) void load(target, 120);
  }, [load, target]);
  const matchesTarget = stationId
    ? data?.station_id === stationId
    : data?.target_kind === "area" &&
      data.requested_lat?.toFixed(2) === areaLat?.toFixed(2) &&
      data.requested_lon?.toFixed(2) === areaLon?.toFixed(2);
  const current = matchesTarget ? data : null;
  const points = useMemo(
    () =>
      (current?.points ?? [])
        .filter(
          (point) =>
            Number.isFinite(point.pm25) &&
            !Number.isNaN(Date.parse(point.valid_at ?? point.forecast_at)),
        )
        .sort(
          (left, right) =>
            Date.parse(left.valid_at ?? left.forecast_at) -
            Date.parse(right.valid_at ?? right.forecast_at),
        ),
    [current],
  );
  const days = useMemo(() => {
    const unique = new Map<
      string,
      { key: string; label: string; first: string }
    >();
    for (const point of points) {
      const at = point.valid_at ?? point.forecast_at;
      const key = forecastDay(at);
      if (!unique.has(key))
        unique.set(key, {
          key,
          first: at,
          label: new Date(at).toLocaleDateString("th-TH", {
            timeZone: "Asia/Bangkok",
            day: "numeric",
            month: "short",
          }),
        });
    }
    return [...unique.values()];
  }, [points]);
  const selected =
    points.find(
      (point) => (point.valid_at ?? point.forecast_at) === selectedAt,
    ) ?? points[0];
  const selectedClassification = classifyPm25(selected?.pm25);
  const unavailable =
    current?.forecast_status === "unavailable" || points.length === 0;

  return (
    <section
      className="cp-map-station-forecast"
      aria-label="พยากรณ์ PM2.5 รายชั่วโมง"
    >
      <div className="cp-map-station-forecast__heading">
        <span className="cp-map-station-forecast__icon" aria-hidden="true">
          <AppIcon name="clock" size={18} />
        </span>
        <div>
          <h2>พยากรณ์ PM2.5 รายชั่วโมง</h2>
          <p>
            {stationId ? "บริเวณสถานี" : "บริเวณที่เลือก"} ·
            ไม่ใช่ค่าตรวจวัดจริง
          </p>
        </div>
      </div>

      {FORECAST_SYSTEM_PAUSED ? (
        <p className="cp-map-station-forecast__empty" role="status">
          {FORECAST_PAUSED_MESSAGE}
        </p>
      ) : loading || (!current && !error) ? (
        <p className="cp-map-station-forecast__empty" role="status">
          กำลังโหลดพยากรณ์…
        </p>
      ) : error ? (
        <p className="cp-map-station-forecast__empty" role="status">
          ยังโหลดพยากรณ์ไม่ได้ · {error}
          <button
            type="button"
            className="cp-focus"
            onClick={() => void load(target, 120, true)}
          >
            ลองใหม่
          </button>
        </p>
      ) : unavailable ? (
        <p className="cp-map-station-forecast__empty" role="status">
          ยังไม่มีพยากรณ์สำหรับบริเวณนี้
        </p>
      ) : (
        <>
          <div
            className="cp-map-station-forecast__featured"
            style={
              {
                "--cp-forecast-color": selectedClassification.color,
                "--cp-forecast-tint": selectedClassification.tint,
              } as React.CSSProperties
            }
          >
            <div>
              <small>
                สำหรับ{" "}
                {formatForecastTime(selected.valid_at ?? selected.forecast_at)}
              </small>
              <strong>
                {selected.pm25} <span>µg/m³</span>
              </strong>
              <small>PM2.5 · {selectedClassification.level}</small>
            </div>
            <span className="cp-map-station-forecast__source">
              {FORECAST_SOURCE_LABELS[selected.source]}
            </span>
          </div>
          <div className="cp-map-forecast-range">
            <p>
              ข้อมูลครบ {points.length} ช่วงเวลา · ถึง{" "}
              {formatProviderTime(
                points[points.length - 1].valid_at ??
                  points[points.length - 1].forecast_at,
              )}
            </p>
            <label>
              เลือกวันพยากรณ์
              <select
                value={forecastDay(selected.valid_at ?? selected.forecast_at)}
                onChange={(event) => {
                  const day = days.find(
                    (day) => day.key === event.target.value,
                  );
                  if (!day) return;
                  setSelectedAt(day.first);
                  const button = timeline.current?.querySelector<HTMLElement>(
                    `[data-day="${day.key}"]`,
                  );
                  if (button)
                    timeline.current?.scrollTo?.({
                      left: button.offsetLeft,
                      behavior: window.matchMedia?.(
                        "(prefers-reduced-motion: reduce)",
                      ).matches
                        ? "auto"
                        : "smooth",
                    });
                }}
              >
                {days.map((day) => (
                  <option key={day.key} value={day.key}>
                    {day.label}
                  </option>
                ))}
              </select>
            </label>
            <small>
              เลื่อนแถบเพื่อดูทุกชั่วโมง หรือเลือกวันเพื่อข้ามไปช่วงที่ต้องการ
            </small>
          </div>
          <div
            className="cp-map-station-forecast__hours"
            ref={timeline}
            role="group"
            aria-label="เลือกชั่วโมงพยากรณ์"
          >
            {points.map((point) => {
              const validAt = point.valid_at ?? point.forecast_at;
              const slot = formatForecastTimelineTime(validAt);
              return (
                <button
                  key={validAt}
                  data-day={forecastDay(validAt)}
                  type="button"
                  className="cp-focus"
                  aria-label={`พยากรณ์ ${formatForecastTime(validAt)} PM2.5 ${point.pm25} ไมโครกรัมต่อลูกบาศก์เมตร`}
                  aria-pressed={
                    validAt === (selected.valid_at ?? selected.forecast_at)
                  }
                  onClick={() => setSelectedAt(validAt)}
                >
                  <span>{slot.day ?? "วันนี้"}</span>
                  <strong>{slot.time}</strong>
                  <b>{point.pm25}</b>
                  <small>µg/m³</small>
                </button>
              );
            })}
          </div>
          <p className="cp-map-station-forecast__note">
            แหล่งพยากรณ์: {FORECAST_SOURCE_LABELS[selected.source]}
            {current?.fetched_at
              ? ` · ดึงข้อมูล ${formatProviderTime(current.fetched_at)}`
              : ""}
            <br />
            ขอพยากรณ์สูงสุด 5 วัน · แสดงถึงเวลาสุดท้ายที่มีในชุดข้อมูล
            <br />
            {selected.source === "openmeteo_cams"
              ? "CAMS เป็นแบบจำลองระดับพื้นที่ ไม่ใช่ค่าที่สถานีจะวัดได้แน่นอน"
              : "ค่าพยากรณ์ใช้ดูแนวโน้ม ไม่ใช่ค่าตรวจวัดจริงของสถานี"}
          </p>
        </>
      )}
    </section>
  );
}

function forecastDay(at: string) {
  return new Date(Date.parse(at) + 7 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}
