"use client";

import { useEffect, useState } from "react";

import { useForecast } from "@/frontend/hooks/useForecast";
import { api } from "@/frontend/lib/api-client";
import {
  formatForecastTime,
  formatProviderTime,
} from "@/frontend/lib/forecast-presentation";
import { haversineKm } from "@/frontend/lib/idw";
import type {
  ForecastResponse,
  ForecastValidationSummary,
} from "@/frontend/types";

type Target =
  | { kind: "station"; id: string; label: string }
  | {
      kind: "area";
      lat: number;
      lon: number;
      label: string;
    };

export default function ForecastMapInspector({
  target,
  onForecastChange,
  onOpenChange,
}: {
  target: Target | null;
  onForecastChange: (value: ForecastResponse | null) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const { data, loading, error, load } = useForecast();
  const [open, setOpen] = useState(false);
  const [accuracy, setAccuracy] = useState<ForecastValidationSummary | null>(
    null,
  );
  const stationId = target?.kind === "station" ? target.id : null;

  useEffect(
    () => () => {
      onForecastChange(null);
      onOpenChange(false);
    },
    [onForecastChange, onOpenChange],
  );

  useEffect(() => {
    if (open && !loading) onForecastChange(data);
  }, [data, open, loading, onForecastChange]);

  useEffect(() => {
    if (!open || !data || !stationId) return;
    let active = true;
    void api.forecastValidationSummary(stationId).then(
      (result) => {
        if (active) setAccuracy(result);
      },
      () => {
        if (active) setAccuracy(null);
      },
    );
    return () => {
      active = false;
    };
  }, [open, data, stationId]);

  if (!target) return null;
  const distance =
    data?.requested_lat != null &&
    data.requested_lon != null &&
    data.grid_lat != null &&
    data.grid_lon != null
      ? haversineKm(
          data.requested_lat,
          data.requested_lon,
          data.grid_lat,
          data.grid_lon,
        )
      : null;
  const firstPoint = data?.points[0];

  return (
    <section
      className="cp-forecast-inspector"
      data-open={open}
      aria-label="ตรวจพิกัดพยากรณ์"
    >
      {!open ? (
        <button
          type="button"
          className="cp-forecast-inspector__trigger cp-focus"
          onClick={() => {
            setOpen(true);
            onOpenChange(true);
            void load(
              target.kind === "station"
                ? target.id
                : { lat: target.lat, lon: target.lon },
              24,
              true,
            );
          }}
        >
          ตรวจพิกัดพยากรณ์
        </button>
      ) : (
        <div className="cp-forecast-inspector__panel">
          <header>
            <div>
              <strong>ตรวจพิกัดพยากรณ์</strong>
              <small>{target.label}</small>
            </div>
            <button
              type="button"
              className="cp-focus"
              onClick={() => {
                setOpen(false);
                onOpenChange(false);
                onForecastChange(null);
              }}
              aria-label="ปิดการตรวจพิกัด"
            >
              ×
            </button>
          </header>
          {loading && <p role="status">กำลังดึงพยากรณ์ CAMS…</p>}
          {error && <p role="alert">{error} · ลองใหม่อีกครั้ง</p>}
          {data && !loading && (
            <>
              <p>
                <span className="cp-forecast-inspector__circle" /> จุดที่ส่ง:{" "}
                {data.requested_lat?.toFixed(4) ?? "—"},{" "}
                {data.requested_lon?.toFixed(4) ?? "—"}
              </p>
              <p>
                <span className="cp-forecast-inspector__square" /> Grid CAMS:{" "}
                {data.grid_lat?.toFixed(4) ?? "ไม่มีพิกัด"}
                {data.grid_lon != null ? `, ${data.grid_lon.toFixed(4)}` : ""}
              </p>
              {distance != null && (
                <p>
                  ระยะระหว่างจุด {distance.toFixed(2)} กม.{" "}
                  <small>ไม่ใช่คะแนนความแม่นยำ</small>
                </p>
              )}
              <p className="cp-forecast-inspector__note">
                Grid คือศูนย์กลางช่องแบบจำลองระดับพื้นที่ ไม่ใช่สถานีตรวจวัด
              </p>
              {firstPoint ? (
                <p className="cp-forecast-inspector__value">
                  พยากรณ์ {firstPoint.pm25.toFixed(1)} µg/m³ สำหรับ{" "}
                  {formatForecastTime(firstPoint.valid_at)}
                </p>
              ) : (
                <p>ยังไม่มีค่าพยากรณ์ในช่วงเวลานี้</p>
              )}
              <p>
                ดึงข้อมูลเมื่อ {formatProviderTime(data.fetched_at)}{" "}
                <small>ไม่ใช่เวลาออกรอบแบบจำลอง</small>
              </p>
              <details className="cp-forecast-inspector__hours">
                <summary>ดูค่าตามเวลา {data.points.length}/24 ชั่วโมง</summary>
                <ol>
                  {data.points.map((point) => (
                    <li key={point.valid_at ?? point.forecast_at}>
                      <time dateTime={point.valid_at ?? point.forecast_at}>
                        {formatForecastTime(point.valid_at)}
                      </time>
                      <strong>{point.pm25.toFixed(1)} µg/m³</strong>
                    </li>
                  ))}
                </ol>
              </details>
              {data.points.length < 24 && (
                <p role="status">
                  ข้อมูลพยากรณ์ไม่ครบ 24 ชั่วโมง ไม่มีการเติมค่าจำลอง
                </p>
              )}
              <p>
                ผลประเมิน:{" "}
                {accuracy?.available && accuracy.mae != null
                  ? `MAE ${accuracy.mae.toFixed(1)} µg/m³ · ${accuracy.sample_count} คู่ · ${formatProviderTime(accuracy.from_valid_at)}–${formatProviderTime(accuracy.through_valid_at)}`
                  : "ยังไม่มีผลประเมิน"}
              </p>
              <p className="cp-forecast-inspector__note">
                ค่าพยากรณ์จาก CAMS/Open‑Meteo ไม่ใช่ค่าฝุ่นที่ตรวจวัดจริง
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
