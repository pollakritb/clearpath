"use client";
import type { ReactNode } from "react";
import { AQI_LEGEND, classifyPm25 } from "@/frontend/lib/aqi";
import {
  bangkokDay,
  formatForecastTime,
  gridValue,
  nearestTime,
} from "@/frontend/lib/forecast-grid";
import type { useForecastGrid } from "@/frontend/hooks/useForecastGrid";
import MapTimelineControls from "./MapTimelineControls";

export default function CamsForecastControls({
  grid,
  point,
  onClosePoint,
  onRequest,
  onExit,
  requestCard,
}: {
  requestCard?: ReactNode;
  grid: ReturnType<typeof useForecastGrid>;
  point: { lat: number; lon: number; name?: string } | null;
  onClosePoint: () => void;
  onRequest: () => void;
  onExit: () => void;
}) {
  const { meta, at, times, surface, loading, error } = grid;
  const value =
    point && surface ? gridValue(surface, point.lat, point.lon) : null;
  const cls = classifyPm25(value);
  const days = [...new Set(times.map(bangkokDay))];
  const currentDay = at ? bangkokDay(at) : (days[0] ?? "");
  const message =
    error ??
    (loading
      ? "กำลังโหลดพยากรณ์…"
      : grid.outOfBounds
        ? "ไม่มีข้อมูลบริเวณนี้"
        : grid.unavailable
          ? "ยังไม่มีพยากรณ์ที่ใช้งานได้"
          : grid.noFrame || (surface && surface.values.every((v) => v === null))
            ? "ไม่มีข้อมูลช่วงนี้"
            : grid.notice
              ? grid.notice
              : meta?.stale
                ? "ใช้ชุดข้อมูลเดิม · ตรวจเวลาอัปเดต"
                : "CAMS · ภาพรวมระดับพื้นที่");
  return (
    <div className="cp-cams-dock">
      {requestCard}
      {!requestCard && point && (
        <section
          className="cp-cams-point"
          aria-label="ค่าพยากรณ์บริเวณที่เลือก"
        >
          <div>
            <strong>{point.name ?? "บริเวณที่เลือก"} · พยากรณ์</strong>
            <button
              type="button"
              className="cp-focus"
              aria-label="ปิดรายละเอียดพยากรณ์"
              onClick={onClosePoint}
            >
              ×
            </button>
          </div>
          <p>
            <b style={{ color: cls.color }}>
              {loading ? "…" : value == null ? "ไม่มีข้อมูล" : value.toFixed(1)}
            </b>
            {value != null && <> µg/m³ · {cls.level}</>}
          </p>
          <small>{at ? formatForecastTime(at) : ""} · CAMS</small>
          <button
            type="button"
            className="cp-cams-point__request cp-focus"
            onClick={onRequest}
          >
            ขอให้ชุมชนช่วยวัดบริเวณนี้ →
          </button>
        </section>
      )}
      <MapTimelineControls
        title="พยากรณ์ PM2.5 · CAMS"
        endAction={
          <button
            type="button"
            className="cp-cams-exit cp-focus"
            aria-label="กลับค่าตรวจวัด"
            title="กลับค่าตรวจวัด"
            onClick={onExit}
          >
            ×
          </button>
        }
        time={at ? formatForecastTime(at) : "ยังไม่มีช่วงเวลา"}
        value={at ? Math.max(0, times.indexOf(at)) : 0}
        max={times.length - 1}
        rangeLabel="เลือกเวลาพยากรณ์ CAMS"
        valueText={at ? formatForecastTime(at) : "ไม่มีข้อมูล"}
        startLabel="ตอนนี้"
        endLabel={
          times.length ? formatForecastTime(times[times.length - 1]) : ""
        }
        playing={grid.playing}
        onPlay={grid.togglePlay}
        onChange={(i) => grid.select(times[i])}
        onNow={grid.now}
        disabled={
          !grid.playing &&
          (loading ||
            !!error ||
            !surface ||
            (!!at && times.indexOf(at) === times.length - 1))
        }
        summary={message}
        extra={
          days.length > 0 ? (
            <label className="cp-cams-day">
              <span className="sr-only">เลือกวันพยากรณ์</span>
              <select
                aria-label="เลือกวันพยากรณ์"
                value={currentDay}
                onChange={(e) => {
                  const options = times.filter(
                    (t) => bangkokDay(t) === e.target.value,
                  );
                  const hour = at ? new Date(at).getTime() % 86400000 : 0;
                  const chosen = nearestTime(
                    options,
                    Date.parse(`${e.target.value}T00:00:00+07:00`) +
                      ((hour + 7 * 3600000) % 86400000),
                  );
                  if (chosen) grid.select(chosen);
                }}
              >
                {days.map((day) => (
                  <option key={day} value={day}>
                    {new Intl.DateTimeFormat("th-TH", {
                      timeZone: "Asia/Bangkok",
                      day: "numeric",
                      month: "short",
                    }).format(new Date(`${day}T12:00:00+07:00`))}
                  </option>
                ))}
              </select>
            </label>
          ) : null
        }
        info={
          <details className="cp-cams-info">
            <summary
              aria-label="ข้อมูลพยากรณ์ CAMS"
              onClick={() => grid.pause()}
            >
              ⓘ
            </summary>
            <div>
              <strong>CAMS Global · Open-Meteo</strong>
              <p>
                ภาพรวมประมาณ 45 กม. ค่าระหว่างกริดเป็นค่าประมาณ ไม่ใช่ค่าตรวจวัด
                ณ จุดนั้น
              </p>
              <p>
                เก็บข้อมูลล่าสุด{" "}
                {meta?.retrieved_at
                  ? formatForecastTime(meta.retrieved_at)
                  : "—"}
              </p>
              <p>เวลาออกแบบจำลอง: ต้นทางไม่ได้ระบุ</p>
              <a
                href={
                  meta?.attribution_url ??
                  "https://open-meteo.com/en/docs/air-quality-api"
                }
                target="_blank"
                rel="noreferrer"
              >
                CAMS / Copernicus · Open-Meteo
              </a>
            </div>
          </details>
        }
      />
      <div
        className="cp-cams-legend"
        aria-label="ระดับ PM2.5 หน่วยไมโครกรัมต่อลูกบาศก์เมตร"
      >
        {AQI_LEGEND.map((band) => (
          <span key={band.range}>
            <i style={{ background: band.color }} />
            {band.range}
          </span>
        ))}
      </div>
      {error && (
        <div className="cp-cams-footer">
          {error && (
            <button type="button" onClick={grid.retry}>
              ลองใหม่
            </button>
          )}
        </div>
      )}
    </div>
  );
}
