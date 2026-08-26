import Link from "next/link";

import AppIcon from "@/frontend/components/ui/AppIcon";
import SourceBadge from "@/frontend/components/ui/SourceBadge";
import { classifyPm25 } from "@/frontend/lib/aqi";
import { communitySourceKind, SOURCE_LABELS } from "@/frontend/lib/source-kind";
import type { CommunityReport, Station } from "@/frontend/types";

interface MapStatusCardProps {
  station: Station | null;
  report: CommunityReport | null;
  updatedAt: string | null;
  horizon: 0 | 1 | 3 | 6 | 12 | 24;
  forecastLoading: boolean;
  forecastError: string | null;
  forecastWarnings: string[];
  onHorizonChange: (horizon: 0 | 1 | 3 | 6 | 12 | 24) => void;
  onClose: () => void;
}

function formatTime(value: string | null) {
  if (!value) return "ไม่ทราบเวลา";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "ไม่ทราบเวลา";
  return date.toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function stationStatus(station: Station) {
  if (station.data_status === "fresh") return "ข้อมูลสด";
  if (station.data_status === "delayed") return "ข้อมูลล่าช้า";
  return "ข้อมูลหมดอายุ";
}

export default function MapStatusCard({
  station,
  report,
  updatedAt,
  horizon,
  forecastLoading,
  forecastError,
  forecastWarnings,
  onHorizonChange,
  onClose,
}: MapStatusCardProps) {
  const selection = report ?? station;

  if (!selection) {
    return (
      <section className="cp-map-time-dock" aria-label="เลือกช่วงเวลาบนแผนที่">
        <div
          className="cp-map-horizon"
          role="group"
          aria-label="ช่วงเวลาบนแผนที่"
        >
          {([0, 1, 3, 6, 12, 24] as const).map((item) => (
            <button
              key={item}
              type="button"
              className="cp-focus"
              aria-pressed={horizon === item}
              data-active={horizon === item}
              onClick={() => onHorizonChange(item)}
            >
              {item === 0 ? "ตอนนี้" : `+${item}ชม.`}
            </button>
          ))}
        </div>
        {horizon > 0 && (
          <div
            className="cp-map-forecast-chip"
            data-state={forecastError ? "error" : "ready"}
          >
            <AppIcon name="model" size={16} />
            <div>
              <strong>พยากรณ์ประเทศไทยอีก {horizon} ชั่วโมง</strong>
              <small>
                {forecastLoading
                  ? "กำลังคำนวณพื้นผิว…"
                  : forecastError
                    ? forecastError
                    : forecastWarnings.length
                      ? "บางพื้นที่ถูกซ่อนเพราะข้อมูลไม่เพียงพอ"
                      : "แตะสถานีเพื่อดูรายละเอียด"}
              </small>
            </div>
          </div>
        )}
      </section>
    );
  }

  const isCommunity = report != null;
  const source = report ? communitySourceKind(report) : "official";
  const value = isCommunity ? report.pm25 : station?.pm25;
  const classification = classifyPm25(value);
  const stationName = station
    ? (station.name_th ?? station.name_en ?? station.id)
    : "";
  const communityArea = report
    ? [report.subdistrict, report.district, report.province]
        .filter(Boolean)
        .join(" · ") || "พื้นที่รายงานโดยประมาณ"
    : "";
  const href = station
    ? `/air?station=${encodeURIComponent(station.id)}`
    : "/community";

  return (
    <section
      className="cp-map-selection-card"
      data-source={source}
      style={
        {
          "--cp-selection-color": classification.color,
          "--cp-selection-tint": classification.tint,
        } as React.CSSProperties
      }
      aria-label={
        source === "sensor"
          ? "รายละเอียดเซนเซอร์ชุมชน"
          : isCommunity
            ? "รายละเอียดรายงานจากประชาชน"
            : "รายละเอียดสถานีตรวจวัดทางการ"
      }
      aria-live="polite"
    >
      <div className="cp-map-selection-card__handle" aria-hidden />
      <button
        type="button"
        className="cp-map-selection-card__close cp-focus"
        onClick={onClose}
        aria-label="ปิดรายละเอียดจุดบนแผนที่"
      >
        <AppIcon name="close" size={19} />
      </button>

      <header className="cp-map-selection-card__heading">
        <SourceBadge kind={source} />
        <h1>{isCommunity ? communityArea : stationName}</h1>
        <p>
          {report
            ? source === "sensor"
              ? `${report.device_model ?? "เครื่องวัดชุมชน"} · ผู้ส่ง ${report.display_name ?? "สมาชิกชุมชน"}`
              : `ผู้รายงาน: ${report.display_name ?? "สมาชิกชุมชน"}`
            : `Air4Thai · กรมควบคุมมลพิษ${station?.province ? ` · ${station.province}` : ""}`}
        </p>
      </header>

      <div className="cp-map-selection-reading">
        <div>
          <strong>{value ?? "—"}</strong>
          <span>µg/m³</span>
          <small>PM2.5</small>
        </div>
        <span className="cp-map-selection-reading__level">
          <i aria-hidden>{classification.glyph}</i>
          <strong>{classification.level}</strong>
        </span>
      </div>

      <div className="cp-map-selection-meta">
        {isCommunity ? (
          <>
            <span>
              <strong>
                {source === "sensor" ? "ระบุการสอบเทียบ" : "ตรวจแล้ว"}
              </strong>
              <small>
                {source === "sensor" && report.calibrated_at
                  ? `สอบเทียบ ${formatTime(report.calibrated_at)} น.`
                  : report.verification_method === "automatic"
                    ? "โดยระบบอัตโนมัติ"
                    : "โดยผู้ดูแล"}
              </small>
            </span>
            <span>
              <strong>Trust {report.trust_score}/100</strong>
              <small>
                {report.age_minutes == null
                  ? "ไม่ทราบเวลาวัด"
                  : `${Math.round(report.age_minutes)} นาทีที่แล้ว`}
              </small>
            </span>
          </>
        ) : (
          <>
            <span>
              <strong>
                {station ? stationStatus(station) : "ไม่มีข้อมูล"}
              </strong>
              <small>
                {station?.age_minutes == null
                  ? `อัปเดต ${formatTime(station?.recorded_at ?? updatedAt)}`
                  : `${Math.round(station.age_minutes)} นาทีที่แล้ว`}
              </small>
            </span>
            <span>
              <strong>{station?.id ?? "—"}</strong>
              <small>รหัสสถานี</small>
            </span>
          </>
        )}
      </div>

      {isCommunity && (
        <p className="cp-map-selection-card__privacy">
          <AppIcon name="shield" size={15} />
          จุดสาธารณะถูกเลื่อนจากพิกัดจริงประมาณ {report.location_precision_m} ม.
        </p>
      )}

      <Link href={href} className="cp-map-selection-card__action cp-focus">
        <span>
          {source === "official"
            ? "ดูค่าฝุ่นและพยากรณ์สถานีนี้"
            : `ดู${SOURCE_LABELS[source].shortLabel}ในชุมชน`}
        </span>
        <AppIcon name="chevron" size={19} />
      </Link>
    </section>
  );
}
