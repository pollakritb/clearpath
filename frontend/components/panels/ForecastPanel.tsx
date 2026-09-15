"use client";

import { useMemo, useState } from "react";

import AppIcon, { type AppIconName } from "@/frontend/components/ui/AppIcon";
import { classifyPm25 } from "@/frontend/lib/aqi";
import {
  agreementLabel,
  FORECAST_LIMITATION_LABELS,
  forecastIntervalHint,
  forecastMethodLabel,
  FORECAST_SOURCE_LABELS,
  FORECAST_SOURCE_ORDER,
  forecastStatus,
  formatForecastTime,
  formatProviderTime,
  PRODUCT_HORIZONS,
} from "@/frontend/lib/forecast-presentation";
import type {
  ForecastResponse,
  ForecastSource,
  Station,
} from "@/frontend/types";

const SOURCE_ICONS: Record<ForecastSource, AppIconName> = {
  clearpath: "activity",
  gistda: "station",
  openmeteo_cams: "model",
  openweather: "database",
};

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
          FORECAST_SOURCE_ORDER.indexOf(left.source) -
          FORECAST_SOURCE_ORDER.indexOf(right.source)
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
  const lowConfidence =
    data?.forecast_status === "limited" || data?.agreement === "low";

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
              <li key={code}>{FORECAST_LIMITATION_LABELS[code] ?? code}</li>
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
                {showingRecommendation
                  ? `อีก ${selected.horizon_hours} ชม. · ${formatForecastTime(selected.forecast_at)}`
                  : "กำลังดูค่าจากแหล่งนี้"}
              </span>
              <small>
                {FORECAST_SOURCE_LABELS[activeSource ?? "clearpath"]}
              </small>
              <strong>{displayPm25}</strong>
              <small>µg/m³ PM2.5 · {classification.level}</small>
            </div>
            {showingRecommendation ? (
              <div className="cp-forecast-interval">
                <span>ช่วงความไม่แน่นอนโดยประมาณ</span>
                <strong>
                  {selected.lower}–{selected.upper} µg/m³
                </strong>
                <small>{forecastIntervalHint(data)}</small>
              </div>
            ) : (
              <div className="cp-forecast-interval">
                <span>ค่าดิบของผู้ให้บริการ</span>
                <strong>ไม่ได้เฉลี่ยกับแหล่งอื่น</strong>
                <small>แตะ “ค่าที่ระบบแนะนำ” เพื่อกลับไปค่าหลัก</small>
              </div>
            )}
          </div>

          <div
            className="cp-forecast-decision"
            data-confidence={lowConfidence ? "low" : "ready"}
          >
            <span className="cp-forecast-decision__icon">
              <AppIcon name={lowConfidence ? "alert" : "check"} size={18} />
            </span>
            <span>
              <strong>
                {lowConfidence
                  ? "ใช้ประกอบการตัดสินใจด้วยความระมัดระวัง"
                  : classification.advice}
              </strong>
              <small>
                {lowConfidence
                  ? `${agreementLabel(data)} ควรตรวจค่าปัจจุบันก่อนทำกิจกรรมกลางแจ้ง`
                  : `${data.provider_count} แหล่งข้อมูล · ${agreementLabel(data)}`}
              </small>
            </span>
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
                    {FORECAST_SOURCE_LABELS[source.source]}
                  </span>
                  <strong>{Math.round(source.pm25 * 10) / 10}</strong>
                  <small>
                    µg/m³ · ออกเมื่อ {formatProviderTime(source.issued_at)}
                  </small>
                </button>
              ))}
              {!selectedSources.length && (
                <div className="cp-forecast-source-empty">
                  ช่วงเวลานี้ยังไม่มีแหล่งภายนอกที่สด
                </div>
              )}
            </div>
            <p className="cp-forecast-source-links">
              {data.providers.slice(0, 3).map((provider) => (
                <a
                  key={provider.source}
                  href={provider.attribution_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  ที่มา {provider.label}
                </a>
              ))}
            </p>
          </details>

          <details className="cp-forecast-details">
            <summary className="cp-focus">
              <span>
                <AppIcon name="info" size={18} />
                รายละเอียดและวิธีคำนวณ
              </span>
              <AppIcon name="chevron" size={17} />
            </summary>
            <div className="cp-forecast-details__body">
              <div className="cp-forecast-method">
                <strong>
                  {forecastMethodLabel(selected, activeSource ?? "clearpath")}
                </strong>
                <span>
                  {data.forecast_mode === "external_provider"
                    ? "ClearPath เลือกแหล่งตามนโยบายที่เปิดเผย และไม่แก้ค่าดิบของผู้ให้บริการ"
                    : "ใช้เฉพาะเมื่อยังไม่มีพยากรณ์ภายนอกที่สด"}
                </span>
              </div>
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
                      : "ยังไม่มีรายงานใกล้เคียงที่ผ่านเกณฑ์"}
                  </p>
                  <small>
                    {data.community_context.affects_recommendation
                      ? "ข้อมูลชุมชนมีผลต่อค่าที่แนะนำในรอบนี้"
                      : "ใช้เป็นหลักฐานประกอบ ยังไม่แก้ค่าพยากรณ์หลัก"}
                  </small>
                </div>
              </section>
              <dl className="cp-forecast-times">
                <div>
                  <dt>พยากรณ์สำหรับ</dt>
                  <dd>{formatProviderTime(selected.forecast_at)}</dd>
                </div>
                <div>
                  <dt>ประมวลผลล่าสุด</dt>
                  <dd>{formatProviderTime(data.generated_at)}</dd>
                </div>
              </dl>
              {!!data.limitation_reason_codes.length && (
                <div className="cp-forecast-notice">
                  {data.limitation_reason_codes
                    .map((code) => FORECAST_LIMITATION_LABELS[code] ?? code)
                    .join(" · ")}
                </div>
              )}
              <details className="cp-forecast-table">
                <summary className="cp-focus">ดูค่าทุกช่วงเวลา</summary>
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
                          <td>{FORECAST_SOURCE_LABELS[point.source]}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
              <p className="cp-forecast-disclaimer">
                พยากรณ์เป็นแนวโน้ม
                ไม่ใช่ค่าตรวจวัดจริงและไม่ใช่คำแนะนำทางการแพทย์
              </p>
            </div>
          </details>
        </div>
      )}
    </section>
  );
}
