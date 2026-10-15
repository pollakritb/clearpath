"use client";

import { useEffect, useMemo, useState } from "react";

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
}: {
  stationId: string;
}) {
  const { data, loading, error, load } = useForecast();
  const [selectedAt, setSelectedAt] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!FORECAST_SYSTEM_PAUSED) void load(stationId, 24);
  }, [load, stationId]);

  const current = data?.station_id === stationId ? data : null;
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
          <p>บริเวณสถานี · ไม่ใช่ค่าตรวจวัดจริง</p>
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
        </p>
      ) : unavailable ? (
        <p className="cp-map-station-forecast__empty" role="status">
          ยังไม่มีพยากรณ์สำหรับสถานีนี้
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
          <div
            className="cp-map-station-forecast__hours"
            role="group"
            aria-label="เลือกชั่วโมงพยากรณ์"
          >
            {(showAll ? points : points.slice(0, 6)).map((point) => {
              const validAt = point.valid_at ?? point.forecast_at;
              const slot = formatForecastTimelineTime(validAt);
              return (
                <button
                  key={validAt}
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
          {points.length > 6 && (
            <button
              type="button"
              className="cp-map-station-forecast__toggle cp-focus"
              onClick={() => setShowAll((value) => !value)}
            >
              {showAll ? "แสดง 6 ชั่วโมงแรก" : `ดูครบ ${points.length} ชั่วโมง`}
            </button>
          )}
          <p className="cp-map-station-forecast__note">
            แหล่งพยากรณ์: {FORECAST_SOURCE_LABELS[selected.source]}
            {current?.fetched_at
              ? ` · ดึงข้อมูล ${formatProviderTime(current.fetched_at)}`
              : ""}
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
