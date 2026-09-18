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
  formatForecastTimelineTime,
  formatProviderTime,
} from "@/frontend/lib/forecast-presentation";
import {
  FORECAST_PAUSED_MESSAGE,
  FORECAST_SYSTEM_PAUSED,
} from "@/frontend/lib/forecast-state";
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

function ForecastPausedPreview() {
  return (
    <div className="cp-forecast-preview cp-anim-rise" aria-live="polite">
      <div className="cp-forecast-preview__hero">
        <span className="cp-forecast-preview__icon" aria-hidden>
          <AppIcon name="activity" size={22} />
        </span>
        <div>
          <span>ช่วงเวลาพยากรณ์</span>
          <strong>ยังไม่มีค่าพยากรณ์</strong>
          <small>ค่าจริงจะแสดงเป็น µg/m³ พร้อมระดับคุณภาพอากาศ</small>
        </div>
        <span className="cp-forecast-preview__value" aria-hidden>
          —
        </span>
      </div>

      <div
        className="cp-forecast-preview__summary"
        aria-label="ข้อมูลประกอบพยากรณ์"
      >
        <div>
          <span>ช่วงค่าที่เป็นไปได้</span>
          <strong>— ถึง — µg/m³</strong>
        </div>
        <div>
          <span>ความเชื่อมั่น</span>
          <strong>รอข้อมูล</strong>
        </div>
      </div>

      <div className="cp-forecast-preview__sources">
        <div className="cp-forecast-preview__sources-heading">
          <span>
            <AppIcon name="layers" size={17} />
            ข้อมูลที่จะใช้ประกอบ
          </span>
          <small>ยังไม่เชื่อมระบบคำนวณ</small>
        </div>
        <ul>
          <li>
            <AppIcon name="activity" size={17} />
            <span>
              <strong>ClearPath</strong>
              <small>ค่าพยากรณ์หลักและช่วงความไม่แน่นอน</small>
            </span>
            <em>รอข้อมูล</em>
          </li>
          <li>
            <AppIcon name="database" size={17} />
            <span>
              <strong>ข้อมูลภายนอก</strong>
              <small>ใช้ตรวจสอบความสอดคล้องของแนวโน้ม</small>
            </span>
            <em>รอข้อมูล</em>
          </li>
          <li>
            <AppIcon name="community" size={17} />
            <span>
              <strong>ข้อมูลชุมชน</strong>
              <small>ใช้เป็นหลักฐานประกอบเมื่อผ่านเกณฑ์</small>
            </span>
            <em>รอข้อมูล</em>
          </li>
        </ul>
      </div>

      <div className="cp-forecast-preview__notice">
        <AppIcon name="info" size={18} />
        <span>
          <strong>{FORECAST_PAUSED_MESSAGE}</strong>
          <small>ระหว่างนี้ให้ใช้ค่าฝุ่นปัจจุบันและคำแนะนำสุขภาพเป็นหลัก</small>
        </span>
      </div>
      <p className="cp-forecast-disclaimer">
        เมื่อเปิดใช้งาน พยากรณ์จะแสดงแนวโน้มเพื่อช่วยวางแผน
        ไม่ใช่ค่าตรวจวัดจริงหรือคำแนะนำทางการแพทย์
      </p>
    </div>
  );
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
  const [selectedForecastAt, setSelectedForecastAt] = useState<string | null>(
    null,
  );
  const [showHourly, setShowHourly] = useState(false);
  const [viewSource, setViewSource] = useState<ForecastSource | null>(null);
  const horizonPoints = useMemo(
    () =>
      [...(data?.points ?? [])].sort(
        (left, right) =>
          Date.parse(left.forecast_at) - Date.parse(right.forecast_at),
      ),
    [data],
  );
  const timelinePoints = useMemo(() => {
    if (showHourly) return horizonPoints;
    const sampled = horizonPoints.filter((_, index) => index % 3 === 0);
    const last = horizonPoints.at(-1);
    if (last && sampled.at(-1)?.forecast_at !== last.forecast_at) {
      sampled.push(last);
    }
    return sampled;
  }, [horizonPoints, showHourly]);
  const selected =
    horizonPoints.find((point) => point.forecast_at === selectedForecastAt) ??
    horizonPoints.at(0);
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
  const externalOnly =
    data?.forecast_mode === "external_provider" &&
    data.recommended_source === "openmeteo_cams" &&
    data.provider_count === 1;
  const unavailable = data?.forecast_status === "unavailable";
  const previewMode = FORECAST_SYSTEM_PAUSED || unavailable;

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
        {(previewMode || data) && (
          <span
            className="cp-forecast-quality"
            data-state={previewMode ? "unavailable" : data?.forecast_status}
          >
            {previewMode
              ? "กำลังพัฒนา"
              : externalOnly
                ? "ข้อมูลจาก CAMS"
                : forecastStatus(data!)}
          </span>
        )}
      </div>

      {!station && (
        <div className="cp-forecast-empty">
          แตะหมุดสถานี แล้วเปิดหน้าอากาศเพื่อดูพยากรณ์
        </div>
      )}
      {loading && !previewMode && (
        <div className="cp-forecast-empty" role="status" aria-live="polite">
          กำลังโหลดพยากรณ์จากแหล่งข้อมูลที่พร้อมใช้งาน…
        </div>
      )}
      {error && !previewMode && (
        <div className="cp-forecast-alert" role="alert">
          {error}
        </div>
      )}

      {station && !previewMode && timelinePoints.length > 0 && (
        <div className="cp-forecast-timeline-wrap">
          <div
            className="cp-forecast-timeline"
            role="group"
            aria-label="พยากรณ์ตามเวลา"
          >
            <div className="cp-forecast-timeline__now" aria-label="ค่าปัจจุบัน">
              <span>ตอนนี้</span>
              <strong>{station.pm25 ?? "—"}</strong>
              <small>ค่าตรวจวัด</small>
            </div>
            {timelinePoints.map((point) => {
              const slot = formatForecastTimelineTime(point.forecast_at);
              const active = selected?.forecast_at === point.forecast_at;
              return (
                <button
                  key={point.forecast_at}
                  type="button"
                  className="cp-focus"
                  aria-label={`${slot.day ? `${slot.day} ` : ""}${slot.time} PM2.5 ${point.pm25} ไมโครกรัมต่อลูกบาศก์เมตร`}
                  aria-pressed={active}
                  data-active={active}
                  onClick={() => {
                    setSelectedForecastAt(point.forecast_at);
                    setViewSource(null);
                  }}
                >
                  <span>{slot.day ?? slot.time}</span>
                  {slot.day && <small>{slot.time}</small>}
                  <strong>{point.pm25}</strong>
                  <small>µg/m³</small>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            className="cp-forecast-timeline-toggle cp-focus"
            aria-pressed={showHourly}
            onClick={() => setShowHourly((value) => !value)}
          >
            <AppIcon name="clock" size={16} />
            {showHourly ? "แสดงทุก 3 ชั่วโมง" : "ดูรายชั่วโมงครบ 24 ชม."}
          </button>
          <p className="cp-forecast-timeline-note">
            “ตอนนี้” คือค่าตรวจวัดจริง · เวลาถัดไปคือค่าดิบจาก CAMS/Open‑Meteo
          </p>
        </div>
      )}

      {previewMode && (
        <div
          className="cp-forecast-timeline-placeholder"
          aria-label="ช่วงเวลาพยากรณ์ยังไม่พร้อม"
        >
          Timeline จะปรากฏเมื่อมีข้อมูลจาก CAMS/Open‑Meteo
        </div>
      )}

      {previewMode && <ForecastPausedPreview />}

      {data && selected && !previewMode && (
        <div className="cp-forecast-card__body cp-anim-rise">
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
                  ? formatForecastTime(selected.forecast_at)
                  : "กำลังดูค่าจากแหล่งนี้"}
              </span>
              <small>
                {FORECAST_SOURCE_LABELS[activeSource ?? "clearpath"]}
              </small>
              <strong>{displayPm25}</strong>
              <small>µg/m³ PM2.5 · {classification.level}</small>
            </div>
            {showingRecommendation && externalOnly ? (
              <div className="cp-forecast-interval">
                <span>แหล่งพยากรณ์</span>
                <strong>CAMS / Open-Meteo</strong>
                <small>
                  แสดงค่าจากผู้ให้บริการโดยตรง ไม่มีการเฉลี่ยหรือปรับค่าด้วยสูตร
                  ClearPath
                </small>
              </div>
            ) : showingRecommendation ? (
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
                {externalOnly
                  ? "ใช้ดูแนวโน้มเพื่อวางแผนล่วงหน้า"
                  : lowConfidence
                    ? "ใช้ประกอบการตัดสินใจด้วยความระมัดระวัง"
                    : classification.advice}
              </strong>
              <small>
                {externalOnly
                  ? "แบบจำลองระดับภูมิภาค ควรตรวจค่าฝุ่นปัจจุบันร่วมด้วย"
                  : lowConfidence
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

          {!externalOnly && (
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
                      µg/m³ · ดึงข้อมูลเมื่อ{" "}
                      {formatProviderTime(source.issued_at)}
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
                    href={provider.license_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {provider.label} · {provider.license}
                  </a>
                ))}
              </p>
            </details>
          )}

          {externalOnly && (
            <p className="cp-forecast-source-links">
              <a
                href="https://open-meteo.com/en/docs/air-quality-api"
                target="_blank"
                rel="noreferrer"
              >
                ข้อมูล CAMS ENSEMBLE ผ่าน Open-Meteo · CC BY 4.0
              </a>
            </p>
          )}

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
                    ? data.selection_evidence.basis === "retrospective_accuracy"
                      ? `เลือกจากผลเทียบค่าจริงย้อนหลัง ${data.selection_evidence.window_days} วัน และไม่แก้ค่าดิบของผู้ให้บริการ`
                      : "หลักฐานย้อนหลังยังไม่พอ จึงเลือกข้อมูลที่ดึงมาใหม่ที่สุดชั่วคราว โดยไม่แก้ค่าดิบ"
                    : "ใช้เฉพาะเมื่อยังไม่มีพยากรณ์ภายนอกที่สด"}
                </span>
              </div>
              {data.selection_evidence.basis === "retrospective_accuracy" && (
                <dl className="cp-forecast-times">
                  <div>
                    <dt>ประเมินความแม่นล่าสุด</dt>
                    <dd>
                      {formatProviderTime(data.selection_evidence.evaluated_at)}
                    </dd>
                  </div>
                  <div>
                    <dt>หลักฐานใช้ได้ถึง</dt>
                    <dd>
                      {formatProviderTime(data.selection_evidence.expires_at)}
                    </dd>
                  </div>
                </dl>
              )}
              {!externalOnly && (
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
              )}
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
                        <tr key={point.forecast_at}>
                          <th scope="row">
                            {formatForecastTime(point.forecast_at)}
                          </th>
                          <td>{point.pm25}</td>
                          <td>
                            {externalOnly
                              ? "—"
                              : `${point.lower}–${point.upper}`}
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
