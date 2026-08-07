"use client";

import { useMemo, useState } from "react";

import { classifyPm25 } from "@/frontend/lib/aqi";
import type {
  ForecastPoint,
  ForecastResponse,
  Station,
} from "@/frontend/types";

const PRODUCT_HORIZONS = [1, 3, 6, 12, 24] as const;

function formatTime(value: string | null): string {
  if (!value) return "ไม่พบเวลา";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "ไม่พบเวลา";
  return date.toLocaleString("th-TH", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function methodLabel(point: ForecastPoint): string {
  return point.model_version
    ? "โมเดล ML ที่ผ่านการอนุมัติ"
    : "แนวโน้มพื้นฐานจากข้อมูลล่าสุด";
}

const SOURCE_LABELS: Record<string, string> = {
  clearpath: "ClearPath",
  openweather: "OpenWeather",
  openmeteo_cams: "CAMS / Open-Meteo",
};

const UNAVAILABLE_LABELS: Record<string, string> = {
  insufficient_hourly_history: "ประวัติรายชั่วโมงยังไม่ครบ 24 จุด",
  official_observation_stale: "ข้อมูล Air4Thai ล่าสุดเกิน 90 นาที",
  official_value_missing: "สถานียังไม่มีค่า PM2.5 ล่าสุด",
  consensus_not_generated: "กำลังรอรอบคำนวณ consensus",
};

function fallbackLabel(codes: string[]): string | null {
  if (!codes.length) return null;
  if (codes.includes("ml_forecast_disabled")) {
    return "ขณะนี้แสดงแนวโน้มพื้นฐานระหว่างรอผลทดสอบโมเดลภาคสนาม";
  }
  if (codes.includes("input_quality_gate_failed")) {
    return "ข้อมูลล่าสุดยังไม่ต่อเนื่องพอสำหรับโมเดล จึงใช้วิธีพื้นฐานแทน";
  }
  if (codes.includes("latest_observation_stale")) {
    return "ข้อมูลสถานีล่าช้า ช่วงคาดการณ์จึงมีความเชื่อมั่นจำกัด";
  }
  return "ระบบใช้วิธีสำรองเพื่อไม่แสดงผลโมเดลที่ยังไม่ผ่านเงื่อนไข";
}

export default function ForecastPanel({
  station,
  data,
  loading,
  error,
}: {
  station: Station | null;
  data: ForecastResponse | null;
  loading: boolean;
  error: string | null;
}) {
  const [selectedHorizon, setSelectedHorizon] = useState<number>(12);
  const horizonPoints = useMemo(
    () =>
      PRODUCT_HORIZONS.flatMap((horizon) => {
        const point = data?.points.find(
          (candidate) => candidate.horizon_hours === horizon,
        );
        return point ? [point] : [];
      }),
    [data],
  );
  const selected =
    horizonPoints.find((point) => point.horizon_hours === selectedHorizon) ??
    horizonPoints.at(-1);
  const classification = classifyPm25(selected?.pm25);
  const fallback = fallbackLabel(data?.fallback_reason_codes ?? []);
  const selectedSources =
    data?.sources.filter(
      (source) => source.horizon_hours === selected?.horizon_hours,
    ) ?? [];

  return (
    <section className="cp-forecast-card" aria-labelledby="forecast-title">
      <div className="cp-forecast-card__heading">
        <div>
          <span className="cp-eyebrow">Forecast · แนวโน้มล่วงหน้า</span>
          <h2 id="forecast-title">พยากรณ์ PM2.5</h2>
          <p>
            {station
              ? station.name_th || station.name_en
              : "เลือกสถานีเพื่อเริ่มดู"}
          </p>
        </div>
        {data && (
          <span className="cp-forecast-quality" data-state={data.data_quality}>
            {data.forecast_status === "available"
              ? "พร้อมใช้งาน"
              : data.forecast_status === "unavailable"
                ? "ยังพยากรณ์ไม่ได้"
                : "ข้อมูลจำกัด"}
          </span>
        )}
      </div>

      {!station && (
        <div className="cp-forecast-empty">
          แตะสถานีบนแผนที่ แล้วเปิดหน้าอากาศเพื่อดูค่าคาดการณ์
        </div>
      )}
      {loading && (
        <div className="cp-forecast-empty" role="status" aria-live="polite">
          กำลังคำนวณแนวโน้ม 1–24 ชั่วโมง…
        </div>
      )}
      {error && (
        <div className="cp-forecast-alert" role="alert">
          {error}
        </div>
      )}

      {data?.forecast_status === "unavailable" && (
        <div className="cp-forecast-alert" role="status">
          <strong>สถานีนี้ยังไม่พร้อมพยากรณ์</strong>
          <ul>
            {data.unavailable_reason_codes.map((code) => (
              <li key={code}>{UNAVAILABLE_LABELS[code] ?? code}</li>
            ))}
          </ul>
        </div>
      )}

      {data && selected && (
        <div className="cp-forecast-card__body cp-anim-rise">
          <div
            className="cp-forecast-horizons"
            role="group"
            aria-label="ช่วงเวลาพยากรณ์"
          >
            {horizonPoints.map((point) => (
              <button
                key={point.horizon_hours}
                type="button"
                className="cp-focus"
                aria-pressed={selected.horizon_hours === point.horizon_hours}
                data-active={selected.horizon_hours === point.horizon_hours}
                onClick={() => setSelectedHorizon(point.horizon_hours)}
              >
                <strong>{point.horizon_hours}</strong>
                <span>ชม.</span>
              </button>
            ))}
          </div>

          <div
            className="cp-forecast-reading"
            style={
              {
                "--cp-forecast-color": classification.color,
                "--cp-forecast-tint": classification.tint,
              } as React.CSSProperties
            }
          >
            <div className="cp-forecast-reading__value">
              <span>
                อีก {selected.horizon_hours} ชั่วโมง · {classification.glyph}{" "}
                {classification.level}
              </span>
              <strong>{selected.pm25}</strong>
              <small>µg/m³ PM2.5</small>
            </div>
            <div className="cp-forecast-interval">
              <span>
                ช่วงคาดการณ์ {Math.round(selected.coverage_target * 100)}%
              </span>
              <strong>
                {selected.lower}–{selected.upper} µg/m³
              </strong>
              <div aria-hidden>
                <span
                  style={{
                    left: `${Math.min(100, (selected.lower / Math.max(selected.upper, 1)) * 100)}%`,
                  }}
                />
              </div>
            </div>
          </div>

          <dl className="cp-forecast-times">
            <div>
              <dt>ข้อมูลสถานีล่าสุด</dt>
              <dd>{formatTime(data.source_recorded_at)}</dd>
            </div>
            <div>
              <dt>สร้างคำพยากรณ์</dt>
              <dd>{formatTime(data.generated_at)}</dd>
            </div>
          </dl>

          <div className="cp-forecast-method">
            <strong>{methodLabel(selected)}</strong>
            <span>
              {selected.model_version
                ? `เวอร์ชัน ${selected.model_version}`
                : "อธิบายได้และใช้เป็น fallback เมื่อ ML ยังไม่ผ่าน gate"}
            </span>
          </div>
          <section
            className="cp-forecast-sources"
            aria-label="แหล่งข้อมูลพยากรณ์"
          >
            <div className="cp-forecast-sources__heading">
              <div>
                <strong>เปรียบเทียบแหล่งข้อมูล</strong>
                <span>
                  ความสอดคล้องของแหล่งข้อมูล{" "}
                  {data.provider_count < 2
                    ? "ยังมีข้อมูลไม่พอ"
                    : data.agreement === "high"
                      ? "สูง"
                      : data.agreement === "medium"
                        ? "ปานกลาง"
                        : data.agreement === "low"
                          ? "ต่ำ"
                          : "ยังมีข้อมูลไม่พอ"}
                </span>
              </div>
              <small>{data.provider_count} แหล่งหลัก</small>
            </div>
            <p>
              แต่ละแหล่งแสดงแยกกันและยังไม่จัดอันดับความแม่นยำ
              ค่าหลักด้านบนเป็นผลของ ClearPath ไม่ใช่ค่าเฉลี่ยจากทุกแหล่ง
            </p>
            <div className="cp-forecast-sources__list">
              {selectedSources.map((source) => (
                <div key={`${source.source}:${source.horizon_hours}`}>
                  <span>{SOURCE_LABELS[source.source] ?? source.source}</span>
                  <strong>{Math.round(source.pm25 * 10) / 10}</strong>
                  <small>µg/m³</small>
                </div>
              ))}
            </div>
          </section>
          {fallback && <div className="cp-forecast-notice">{fallback}</div>}
          {(data.warnings.includes("wide_uncertainty_interval") ||
            data.data_quality === "limited") && (
            <div className="cp-forecast-alert" role="status">
              ช่วงค่ากว้างหรือข้อมูลมีจำกัด
              โปรดใช้เป็นแนวโน้มและตรวจค่าล่าสุดร่วมด้วย
            </div>
          )}

          <details className="cp-forecast-table">
            <summary className="cp-focus">ดูค่าทุกช่วงเวลาแบบตาราง</summary>
            <div>
              <table>
                <caption>ค่าพยากรณ์ PM2.5 และช่วงความไม่แน่นอน</caption>
                <thead>
                  <tr>
                    <th scope="col">อีก</th>
                    <th scope="col">ค่ากลาง</th>
                    <th scope="col">ช่วงคาดการณ์</th>
                    <th scope="col">วิธี</th>
                  </tr>
                </thead>
                <tbody>
                  {horizonPoints.map((point) => (
                    <tr key={point.horizon_hours}>
                      <th scope="row">{point.horizon_hours} ชม.</th>
                      <td>{point.pm25}</td>
                      <td>
                        {point.lower}–{point.upper}
                      </td>
                      <td>{point.model_version ? "ML" : "พื้นฐาน"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>

          <p className="cp-forecast-disclaimer">
            ค่าพยากรณ์มีความไม่แน่นอน ไม่รับประกันผล และไม่ใช่คำแนะนำทางการแพทย์
          </p>
        </div>
      )}
    </section>
  );
}
