import Link from "next/link";

import ReportEngagement from "@/frontend/components/community/ReportEngagement";
import AppIcon from "@/frontend/components/ui/AppIcon";
import CalibrationBadge from "@/frontend/components/ui/CalibrationBadge";
import SourceBadge from "@/frontend/components/ui/SourceBadge";
import { classifyPm25 } from "@/frontend/lib/aqi";
import { publicReporterAvatar } from "@/frontend/lib/reporter-profile";
import { communitySourceKind, SOURCE_LABELS } from "@/frontend/lib/source-kind";
import type { CommunityReport, Station } from "@/frontend/types";

interface MapStatusCardProps {
  station: Station | null;
  report: CommunityReport | null;
  updatedAt: string | null;
  onClose: () => void;
  onOpenHistory?: () => void;
  historicalAt?: string | null;
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
  onClose,
  onOpenHistory,
  historicalAt = null,
}: MapStatusCardProps) {
  const selection = report ?? station;

  if (!selection) {
    return (
      <section
        className="cp-map-current-dock"
        aria-label="สถานะแผนที่ค่าฝุ่นปัจจุบัน"
      >
        <span className="cp-map-current-dock__icon" aria-hidden="true">
          <AppIcon name="activity" size={19} />
        </span>
        <span className="cp-map-current-dock__copy">
          <strong>ค่าฝุ่นปัจจุบัน</strong>
          <small>Air4Thai · ข้อมูลชุมชนที่ผ่านการตรวจ</small>
        </span>
        <span className="cp-map-current-dock__actions">
          <time
            className="cp-map-current-dock__time"
            dateTime={updatedAt ?? undefined}
          >
            <i aria-hidden="true" />
            {updatedAt ? `อัปเดต ${formatTime(updatedAt)} น.` : "กำลังอัปเดต"}
          </time>
          {onOpenHistory && (
            <button
              type="button"
              className="cp-map-current-dock__history cp-focus"
              onClick={onOpenHistory}
            >
              <AppIcon name="clock" size={15} />
              ย้อนหลัง
            </button>
          )}
        </span>
      </section>
    );
  }

  const isCommunity = report != null;
  const source = report ? communitySourceKind(report) : "official";
  const value = isCommunity ? report.pm25 : station?.pm25;
  const classification = classifyPm25(value);
  const reporterAvatar = report ? publicReporterAvatar(report) : null;
  const showReporterProfile = Boolean(
    report?.source_type === "individual" && report.show_reporter_profile,
  );
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
          ? "รายละเอียดสถานีเซนเซอร์ชุมชน"
          : isCommunity
            ? "รายละเอียดรายงานจากบุคคล"
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
              ? `${report.device_model ?? "ไม่ระบุรุ่นอุปกรณ์"} · อุปกรณ์ประจำจุดที่ลงทะเบียน`
              : `${report.device_model ?? "ไม่ระบุรุ่นเครื่องวัด"} · ${
                  showReporterProfile
                    ? `ผู้รายงาน ${report.display_name ?? "สมาชิกชุมชน"}`
                    : "ผู้รายงานไม่เปิดเผยตัวตน"
                }`
            : `Air4Thai · กรมควบคุมมลพิษ${station?.province ? ` · ${station.province}` : ""}`}
        </p>
        {report?.device_calibrated && (
          <CalibrationBadge date={report.calibrated_at} />
        )}
      </header>

      {source === "individual" && report && (
        <div
          className="cp-map-reporter-profile"
          data-hidden={!showReporterProfile}
        >
          {reporterAvatar ? (
            // The backend and frontend both restrict this to Google HTTPS avatars.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={reporterAvatar}
              alt=""
              width={46}
              height={46}
              referrerPolicy="no-referrer"
            />
          ) : (
            <span aria-hidden>
              <AppIcon name="user" size={22} />
            </span>
          )}
          <div>
            <small>ผู้แบ่งปันข้อมูล</small>
            <strong>
              {showReporterProfile
                ? (report.display_name ?? "สมาชิกชุมชน")
                : "ไม่เปิดเผยตัวตน"}
            </strong>
            <p>
              {showReporterProfile
                ? "โปรไฟล์ Google ที่เจ้าของอนุญาตให้แสดงในรายงานนี้"
                : "เจ้าของรายงานเลือกซ่อนชื่อและรูปโปรไฟล์"}
            </p>
          </div>
        </div>
      )}

      {source === "individual" && report?.image_url && (
        <a
          href={report.image_url}
          target="_blank"
          rel="noreferrer"
          className="cp-map-report-photo cp-focus"
          aria-label="เปิดดูภาพเครื่องวัดจากรายงานนี้"
        >
          {/* The API exposes only a short-lived signed URL from private storage. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={report.image_url}
            alt="ภาพหน้าจอเครื่องวัด PM2.5 จากผู้รายงาน"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
          <span>
            <AppIcon name="camera" size={17} />
            แตะเพื่อดูภาพเครื่องวัด
          </span>
        </a>
      )}

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
                {report.verification_method === "automatic"
                  ? "ระบบตรวจอัตโนมัติแล้ว"
                  : "ข้อมูลที่ตรวจด้วยระบบเดิม"}
              </strong>
              <small>{SOURCE_LABELS[source].description}</small>
            </span>
            <span>
              <strong>เวลาที่ตรวจวัด</strong>
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
                {station
                  ? historicalAt
                    ? "ค่าตรวจวัดย้อนหลัง"
                    : stationStatus(station)
                  : "ไม่มีข้อมูล"}
              </strong>
              <small>
                {historicalAt
                  ? `ตรวจวัด ${formatTime(station?.recorded_at ?? historicalAt)} น.`
                  : station?.age_minutes == null
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

      {source === "individual" && report && (
        <ReportEngagement key={report.id} report={report} />
      )}

      <Link href={href} className="cp-map-selection-card__action cp-focus">
        <span>
          {source === "official"
            ? "ดูค่าฝุ่นและรายละเอียดสถานีนี้"
            : source === "sensor"
              ? "ดูสถานีชุมชนในเครือข่าย"
              : "ดูรายงานนี้ในชุมชน"}
        </span>
        <AppIcon name="chevron" size={19} />
      </Link>
    </section>
  );
}
