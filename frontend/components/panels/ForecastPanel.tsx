"use client";

import { useMemo, useState } from "react";

import AppIcon, { type AppIconName } from "@/frontend/components/ui/AppIcon";
import { classifyPm25 } from "@/frontend/lib/aqi";
import type {
  ForecastPoint,
  ForecastResponse,
  ForecastSource,
  Station,
} from "@/frontend/types";

const PRODUCT_HORIZONS = [1, 3, 6, 12, 24] as const;

const SOURCE_LABELS: Record<ForecastSource, string> = {
  clearpath: "ClearPath",
  gistda: "GISTDA เช็คฝุ่น",
  openmeteo_cams: "CAMS / Open-Meteo",
  openweather: "OpenWeather",
};

const SOURCE_ICONS: Record<ForecastSource, AppIconName> = {
  clearpath: "activity",
  gistda: "station",
  openmeteo_cams: "model",
  openweather: "database",
};

const SOURCE_ORDER: ForecastSource[] = [
  "gistda",
  "openmeteo_cams",
  "openweather",
  "clearpath",
];

const LIMITATION_LABELS: Record<string, string> = {
  external_provider_partial_horizon: "แหล่งภายนอกครอบคลุมไม่ครบทุกชั่วโมง",
  single_external_provider:
    "ช่วงนี้มีข้อมูลจากผู้ให้บริการภายนอกเพียงแหล่งเดียว",
  external_provider_unavailable: "ยังไม่มีข้อมูลพยากรณ์ภายนอกที่สด",
  external_provider_disagreement: "ผู้ให้บริการให้ค่าต่างกันมาก",
  local_fallback_only: "กำลังใช้แนวโน้มสำรองจากข้อมูลสถานี",
  local_inputs_unusable: "ข้อมูลสถานีไม่เพียงพอสำหรับวิธีสำรอง",
};

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

function agreementLabel(data: ForecastResponse): string {
  if (data.provider_count < 2) return "ยังเปรียบเทียบไม่ได้";
  if (data.agreement === "high") return "ใกล้เคียงกัน";
  if (data.agreement === "medium") return "ต่างกันปานกลาง";
  return "ต่างกันมาก";
}

function forecastStatus(data: ForecastResponse): string {
  if (data.forecast_status === "available") return "พร้อมใช้งาน";
  if (data.forecast_status === "limited") return "ข้อมูลจำกัด";
  return "ยังไม่มีพยากรณ์ที่เชื่อถือได้";
}

function methodLabel(point: ForecastPoint, source: ForecastSource): string {
  if (source !== "clearpath") {
    return `ค่าดิบจาก ${SOURCE_LABELS[source]}`;
  }
  return point.model_version
    ? "โมเดล ClearPath ที่ผ่าน release gate"
    : "แนวโน้มสำรองจากข้อมูลสถานีล่าสุด";
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
  const [viewSource, setViewSource] = useState<ForecastSource | null>(null);
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
  const selectedSources =
    data?.sources
      .filter(
        (source) =>
          source.horizon_hours === selected?.horizon_hours &&
          source.source !== "clearpath" &&
          source.available,
      )
      .sort((left, right) => {
        if (left.source === selected?.source) return -1;
        if (right.source === selected?.source) return 1;
        return (
          SOURCE_ORDER.indexOf(left.source) - SOURCE_ORDER.indexOf(right.source)
        );
      })
      .slice(0, 3) ?? [];
  const activeSourcePoint = selectedSources.find(
    (source) => source.source === viewSource,
  );
  const activeSource = activeSourcePoint?.source ?? selected?.source;
  const displayPm25 = activeSourcePoint?.pm25 ?? selected?.pm25;
  const classification = classifyPm25(displayPm25);
  const showingRecommendation = !activeSourcePoint;

  return (
    <section className="cp-forecast-card" aria-labelledby="forecast-title">
      <div className="cp-forecast-card__heading">
        <div>
          <span className="cp-eyebrow">Forecast · พยากรณ์ล่วงหน้า</span>
          <h2 id="forecast-title">PM2.5 ในพื้นที่นี้</h2>
          <p>
            {station ? station.name_th || station.name_en : "เลือกสถานีก่อน"}
          </p>
        </div>
        {data && (
          <span
            className="cp-forecast-quality"
            data-state={data.forecast_status}
          >
            {forecastStatus(data)}
          </span>
        )}
      </div>

      {!station && (
        <div className="cp-forecast-empty">
          แตะหมุดสถานี แล้วเปิดหน้าอากาศเพื่อดูพยากรณ์
        </div>
      )}
      {loading && (
        <div className="cp-forecast-empty" role="status" aria-live="polite">
          กำลังโหลดพยากรณ์จากแหล่งข้อมูลที่พร้อมใช้งาน…
        </div>
      )}
      {error && (
        <div className="cp-forecast-alert" role="alert">
          {error}
        </div>
      )}

      {data?.forecast_status === "unavailable" && (
        <div className="cp-forecast-alert" role="status">
          <strong>ยังไม่แสดงตัวเลขเพื่อป้องกันความเข้าใจผิด</strong>
          <ul>
            {data.unavailable_reason_codes.map((code) => (
              <li key={code}>{LIMITATION_LABELS[code] ?? code}</li>
            ))}
          </ul>
        </div>
      )}

      {data && selected && data.forecast_status !== "unavailable" && (
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
                onClick={() => {
                  setSelectedHorizon(point.horizon_hours);
                  setViewSource(null);
                }}
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
              <span className="cp-forecast-reading__source">
                <AppIcon
                  name={SOURCE_ICONS[activeSource ?? "clearpath"]}
                  size={16}
                />
                {showingRecommendation ? "ค่าที่ระบบแนะนำ" : "กำลังดูแหล่งนี้"}
              </span>
              <small>{SOURCE_LABELS[activeSource ?? "clearpath"]}</small>
              <strong>{displayPm25}</strong>
              <small>µg/m³ PM2.5 · {classification.level}</small>
            </div>
            {showingRecommendation ? (
              <div className="cp-forecast-interval">
                <span>ช่วงความไม่แน่นอนโดยประมาณ</span>
                <strong>
                  {selected.lower}–{selected.upper} µg/m³
                </strong>
                <small>
                  ยิ่งหลายแหล่งให้ค่าใกล้กัน ยิ่งใช้วางแผนได้มั่นใจขึ้น
                </small>
              </div>
            ) : (
              <div className="cp-forecast-interval">
                <span>ค่าดิบของผู้ให้บริการ</span>
                <strong>ไม่ได้เฉลี่ยกับแหล่งอื่น</strong>
                <small>แตะ “ค่าที่ระบบแนะนำ” เพื่อกลับไปค่าหลัก</small>
              </div>
            )}
          </div>

          <button
            type="button"
            className="cp-forecast-reset cp-focus"
            hidden={showingRecommendation}
            onClick={() => setViewSource(null)}
          >
            <AppIcon name="back" size={16} />
            กลับไปค่าที่ระบบแนะนำ
          </button>

          <div className="cp-forecast-method">
            <strong>
              {methodLabel(selected, activeSource ?? "clearpath")}
            </strong>
            <span>
              {data.forecast_mode === "external_provider"
                ? "ClearPath เลือกแหล่งตามนโยบายที่เปิดเผย และไม่แก้ค่าดิบของผู้ให้บริการ"
                : "ใช้เฉพาะเมื่อยังไม่มีพยากรณ์ภายนอกที่สด"}
            </span>
          </div>

          <details className="cp-forecast-sources">
            <summary className="cp-focus">
              <span>
                <AppIcon name="layers" size={18} />
                เปรียบเทียบแหล่งข้อมูล
              </span>
              <small>
                {data.provider_count} แหล่ง · {agreementLabel(data)}
              </small>
            </summary>
            <p>
              เลือกดูค่าดิบได้เองสูงสุด 3 แหล่ง โดยค่าของแต่ละแหล่งไม่ถูกแก้ไข
              หรือแอบเฉลี่ยเข้าด้วยกัน
            </p>
            <div className="cp-forecast-sources__list">
              {selectedSources.map((source) => (
                <button
                  type="button"
                  className="cp-focus"
                  data-source={source.source}
                  data-active={activeSource === source.source}
                  key={`${source.source}:${source.horizon_hours}`}
                  onClick={() => setViewSource(source.source)}
                >
                  <span>
                    <AppIcon name={SOURCE_ICONS[source.source]} size={18} />
                    {SOURCE_LABELS[source.source]}
                  </span>
                  <strong>{Math.round(source.pm25 * 10) / 10}</strong>
                  <small>µg/m³ · ออกเมื่อ {formatTime(source.issued_at)}</small>
                </button>
              ))}
              {!selectedSources.length && (
                <div className="cp-forecast-source-empty">
                  ช่วงเวลานี้ยังไม่มีแหล่งภายนอกที่สด
                </div>
              )}
            </div>
            <div className="cp-forecast-provider-notes">
              {data.providers.slice(0, 3).map((provider) => (
                <div
                  key={provider.source}
                  data-state={provider.freshness_status}
                >
                  <AppIcon name={SOURCE_ICONS[provider.source]} size={17} />
                  <span>
                    <strong>{provider.label}</strong>
                    <small>{provider.usage_note}</small>
                  </span>
                  <a
                    href={provider.attribution_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    ที่มา
                  </a>
                </div>
              ))}
            </div>
          </details>

          <section
            className="cp-forecast-community"
            aria-label="ข้อมูลจากชุมชน"
          >
            <span className="cp-forecast-community__icon">
              <AppIcon name="community" size={20} />
            </span>
            <div>
              <strong>ข้อมูลยืนยันจากชุมชน</strong>
              <p>
                {data.community_context.nearby_report_count
                  ? `พบ ${data.community_context.nearby_report_count} รายงานที่ผ่านเกณฑ์ภายใน ${data.community_context.radius_km} กม.`
                  : "ยังไม่มีรายงานใกล้เคียงที่ผ่านเกณฑ์ Trust และหลักฐานครบ"}
              </p>
              <small>
                {data.community_context.affects_recommendation
                  ? "ข้อมูลชุมชนมีผลต่อค่าที่แนะนำในรอบนี้"
                  : "ขณะนี้แสดงเป็นหลักฐานประกอบ ยังไม่แก้ค่าพยากรณ์หลัก"}
              </small>
            </div>
          </section>

          <dl className="cp-forecast-times">
            <div>
              <dt>พยากรณ์สำหรับ</dt>
              <dd>{formatTime(selected.forecast_at)}</dd>
            </div>
            <div>
              <dt>ClearPath ประมวลผล</dt>
              <dd>{formatTime(data.generated_at)}</dd>
            </div>
          </dl>

          {!!data.limitation_reason_codes.length && (
            <div className="cp-forecast-notice">
              {data.limitation_reason_codes
                .map((code) => LIMITATION_LABELS[code] ?? code)
                .join(" · ")}
            </div>
          )}

          <details className="cp-forecast-table">
            <summary className="cp-focus">ดูค่าที่แนะนำทุกช่วงเวลา</summary>
            <div>
              <table>
                <caption>ค่าพยากรณ์ PM2.5 และแหล่งที่เลือก</caption>
                <thead>
                  <tr>
                    <th scope="col">อีก</th>
                    <th scope="col">PM2.5</th>
                    <th scope="col">ช่วงประมาณ</th>
                    <th scope="col">แหล่ง</th>
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
                      <td>{SOURCE_LABELS[point.source]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>

          <p className="cp-forecast-disclaimer">
            พยากรณ์เป็นแนวโน้ม ไม่ใช่ค่าตรวจวัดจริงและไม่ใช่คำแนะนำทางการแพทย์
            หากแหล่งข้อมูลต่างกันมาก
            ควรลดกิจกรรมกลางแจ้งและตรวจค่าปัจจุบันร่วมด้วย
          </p>
        </div>
      )}
    </section>
  );
}
