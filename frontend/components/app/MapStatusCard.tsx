"use client";

import { useRef, useState } from "react";

import Link from "next/link";

import MapStationForecast from "@/frontend/components/app/MapStationForecast";
import ReportEngagement from "@/frontend/components/community/ReportEngagement";
import AppIcon from "@/frontend/components/ui/AppIcon";
import SourceBadge from "@/frontend/components/ui/SourceBadge";
import { classifyPm25 } from "@/frontend/lib/aqi";
import { formatCommunityArea } from "@/frontend/lib/community-location";
import { formatProviderTime } from "@/frontend/lib/forecast-presentation";
import { publicReporterAvatar } from "@/frontend/lib/reporter-profile";
import { communitySourceKind, SOURCE_LABELS } from "@/frontend/lib/source-kind";
import type { CommunityReport, Station } from "@/frontend/types";

interface MapStatusCardProps {
  station: Station | null;
  report: CommunityReport | null;
  updatedAt: string | null;
  onClose: () => void;
  onBackToPlace?: () => void;
  backLabel?: string;
  onOpenHistory?: () => void;
  historicalAt?: string | null;
}

function formatTime(value: string | null) {
  if (!value) return "ไม่ทราบเวลา";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "ไม่ทราบเวลา";
  return date.toLocaleTimeString("th-TH", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function stationStatus(station: Station) {
  if (station.data_status === "fresh") return "ข้อมูลสด";
  if (station.data_status === "delayed") return "ข้อมูลล่าช้า";
  return "ข้อมูลหมดอายุ";
}

function formatReportDate(value: string | null) {
  if (!value) return "ไม่ทราบเวลาตรวจวัด";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "ไม่ทราบเวลาตรวจวัด";
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function averagingLabel(period: CommunityReport["averaging_period"]) {
  if (period === "1_minute") return "เฉลี่ย 1 นาที";
  if (period === "5_minutes") return "เฉลี่ย 5 นาที";
  return "ค่า ณ ขณะวัด";
}

export default function MapStatusCard({
  station,
  report,
  updatedAt,
  onClose,
  onBackToPlace,
  backLabel = "กลับไปยังสถานที่",
  onOpenHistory,
  historicalAt = null,
}: MapStatusCardProps) {
  const [expanded, setExpanded] = useState(false);
  const photoDialogRef = useRef<HTMLDialogElement>(null);
  const photoButtonRef = useRef<HTMLButtonElement>(null);
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
  const communityArea = report ? formatCommunityArea(report) : "";
  const href = station
    ? `/air?station=${encodeURIComponent(station.id)}`
    : "/community";
  const isDemo = report?.policy_version === "demo-v1";
  const selectionLabel =
    source === "sensor"
      ? "รายละเอียดสถานีเซนเซอร์ชุมชน"
      : isCommunity
        ? "รายละเอียดรายงานจากบุคคล"
        : "รายละเอียดสถานีตรวจวัดทางการ";

  if (!expanded) {
    return (
      <section
        className="cp-map-selection-card cp-map-selection-card--compact"
        data-source={source}
        data-expanded="false"
        style={
          {
            "--cp-selection-color": classification.color,
            "--cp-selection-tint": classification.tint,
          } as React.CSSProperties
        }
        aria-label={selectionLabel}
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
        {onBackToPlace && (
          <button
            type="button"
            className="cp-map-selection-card__back cp-focus"
            onClick={onBackToPlace}
          >
            ← {backLabel}
          </button>
        )}
        <div className="cp-map-compact-heading">
          <SourceBadge kind={source} compact />
          {isDemo && <span className="cp-map-demo-label">ข้อมูลตัวอย่าง</span>}
          <h1>{isCommunity ? communityArea : stationName}</h1>
        </div>
        <div className="cp-map-compact-reading">
          <div>
            <strong>{value ?? "—"}</strong>
            <span>
              µg/m³ <small>PM2.5</small>
            </span>
          </div>
          <span>{value == null ? "ไม่มีข้อมูล" : classification.level}</span>
        </div>
        <button
          type="button"
          className="cp-map-compact-open cp-focus"
          onClick={() => setExpanded(true)}
          aria-label={
            isCommunity ? "ดูรายละเอียดรายงานและผู้รายงาน" : "ดูรายละเอียดสถานี"
          }
        >
          <span>
            {isCommunity ? "ดูรายงานและผู้รายงาน" : "ดูรายละเอียดสถานี"}
          </span>
          <AppIcon name="chevron" size={18} />
        </button>
      </section>
    );
  }

  return (
    <section
      className="cp-map-selection-card"
      data-source={source}
      data-expanded="true"
      style={
        {
          "--cp-selection-color": classification.color,
          "--cp-selection-tint": classification.tint,
        } as React.CSSProperties
      }
      aria-label={selectionLabel}
      aria-live="polite"
    >
      <div className="cp-map-selection-card__handle" aria-hidden />
      <button
        type="button"
        className="cp-map-selection-card__collapse cp-focus"
        onClick={() => setExpanded(false)}
      >
        ← กลับไปแผนที่
      </button>
      {onBackToPlace && (
        <button
          type="button"
          className="cp-map-selection-card__back cp-focus"
          onClick={onBackToPlace}
        >
          ← {backLabel}
        </button>
      )}
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
        {isDemo && <span className="cp-map-demo-label">ข้อมูลตัวอย่าง</span>}
        <h1>{isCommunity ? communityArea : stationName}</h1>
        <p>
          {report
            ? "รายงาน PM2.5 จากภาพเครื่องวัด · ไม่ใช่สถานีทางการ"
            : `${station?.province ?? "ประเทศไทย"} · รหัสสถานี ${station?.id ?? "—"}`}
        </p>
      </header>

      <div className="cp-map-selection-reading">
        <div>
          <span className="cp-map-selection-reading__caption">
            {isCommunity ? "ค่าจากรายงานนี้" : "ค่าตรวจวัดของสถานี"}
          </span>
          <strong>{value ?? "—"}</strong>
          <span>µg/m³</span>
          <small>PM2.5</small>
        </div>
        <span className="cp-map-selection-reading__level">
          <i aria-hidden>{classification.glyph}</i>
          <strong>{classification.level}</strong>
        </span>
      </div>

      {station && (
        <p className="cp-map-station-advice">
          <AppIcon name="activity" size={17} />
          {value == null
            ? "ยังไม่มีค่าตรวจวัดที่แสดงได้"
            : classification.advice}
        </p>
      )}

      {station &&
        (historicalAt ? (
          <p className="cp-map-station-forecast__empty">
            กลับสู่เวลาปัจจุบันเพื่อดูพยากรณ์ของสถานีนี้
          </p>
        ) : (
          <MapStationForecast stationId={station.id} />
        ))}

      {source === "individual" && report && (
        <p className="cp-map-report-freshness">
          <AppIcon name="clock" size={16} />
          {report.is_fresh ? "รายงานล่าสุด" : "รายงานเก่า"} · ตรวจวัด
          {report.age_minutes == null
            ? "ไม่ทราบเวลา"
            : `${Math.round(report.age_minutes)} นาทีที่แล้ว`}
        </p>
      )}

      {station ? (
        <section
          className="cp-map-station-source"
          aria-label="ที่มาข้อมูลสถานี"
        >
          <div className="cp-map-station-source__heading">
            <AppIcon name="station" size={19} />
            <div>
              <h2>ที่มาข้อมูลสถานี</h2>
              <p>Air4Thai · กรมควบคุมมลพิษ</p>
            </div>
          </div>
          <dl>
            <div>
              <dt>สถานะข้อมูล</dt>
              <dd>
                {historicalAt ? "ค่าตรวจวัดย้อนหลัง" : stationStatus(station)}
              </dd>
            </div>
            <div>
              <dt>ตรวจวัดล่าสุด</dt>
              <dd>{formatProviderTime(station.recorded_at)}</dd>
            </div>
            <div>
              <dt>รหัสสถานี</dt>
              <dd>{station.id}</dd>
            </div>
            <div>
              <dt>จังหวัด</dt>
              <dd>{station.province ?? "ไม่ระบุ"}</dd>
            </div>
          </dl>
        </section>
      ) : (
        <section
          className="cp-map-selection-section cp-map-report-evidence"
          aria-label="ข้อมูลรายงานค่าฝุ่น"
        >
          <div className="cp-map-report-section-heading">
            <div>
              <h2>หลักฐานและการตรวจวัด</h2>
              <p>ตัวเลข PM2.5 ที่ระบบอ่านจากภาพเครื่องวัด</p>
            </div>
            <span>
              {report?.verification_method === "automatic"
                ? "อ่านด้วย OCR"
                : "ข้อมูลระบบเดิม"}
            </span>
          </div>
          {source === "individual" && report?.image_url && (
            <>
              <button
                ref={photoButtonRef}
                type="button"
                className="cp-map-report-photo cp-focus"
                aria-label="เปิดดูภาพเครื่องวัดจากรายงานนี้"
                onClick={() => photoDialogRef.current?.showModal()}
              >
                <span className="cp-map-report-photo__thumb">
                  {/* The API exposes only a short-lived signed URL from private storage. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={report.image_url}
                    alt="ภาพหน้าจอเครื่องวัด PM2.5 จากผู้รายงาน"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                </span>
                <span className="cp-map-report-photo__copy">
                  <strong>ดูภาพเครื่องวัดที่ส่งมา</strong>
                  <small>แตะเพื่อขยายภาพในหน้านี้</small>
                </span>
                <AppIcon name="chevron" size={19} />
              </button>
              <dialog
                ref={photoDialogRef}
                className="cp-map-photo-dialog"
                aria-label="ภาพเครื่องวัดจากรายงานนี้"
                onClose={() => photoButtonRef.current?.focus()}
                onClick={(event) => {
                  if (event.target === event.currentTarget) {
                    photoDialogRef.current?.close();
                  }
                }}
              >
                <div className="cp-map-photo-dialog__content">
                  <div className="cp-map-photo-dialog__header">
                    <div>
                      <strong>ภาพเครื่องวัดจากรายงาน</strong>
                      <small>
                        PM2.5 {report.pm25 ?? "—"} µg/m³ ·{" "}
                        {formatReportDate(report.captured_at)}
                      </small>
                    </div>
                    <button
                      type="button"
                      className="cp-map-photo-dialog__close cp-focus"
                      aria-label="ปิดภาพเครื่องวัด"
                      onClick={() => photoDialogRef.current?.close()}
                    >
                      <AppIcon name="close" size={20} />
                    </button>
                  </div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={report.image_url}
                    alt="ภาพเครื่องวัด PM2.5 ฉบับเต็มจากผู้รายงาน"
                    referrerPolicy="no-referrer"
                  />
                  <p>ภาพประกอบรายงานจากผู้ใช้ ไม่ใช่ภาพจากสถานีทางการ</p>
                </div>
              </dialog>
            </>
          )}
          <div className="cp-map-selection-meta">
            <span>
              <strong>เวลาที่ตรวจวัด</strong>
              <small>
                {report?.captured_at
                  ? `${formatReportDate(report.captured_at)} น.`
                  : "ไม่ทราบเวลาตรวจวัด"}
              </small>
            </span>
            <span>
              <strong>อุปกรณ์</strong>
              <small>{report?.device_model ?? "ไม่ระบุรุ่น"}</small>
            </span>
            <span>
              <strong>ช่วงเวลาของค่า</strong>
              <small>
                {report ? averagingLabel(report.averaging_period) : "ไม่ระบุ"}
              </small>
            </span>
            <span>
              <strong>การตรวจข้อมูล</strong>
              <small>
                {report?.verification_method === "automatic"
                  ? "อ่านตัวเลขจากภาพอัตโนมัติ"
                  : "ข้อมูลระบบเดิม"}
              </small>
            </span>
          </div>
          {isCommunity && (
            <p className="cp-map-selection-card__privacy">
              <AppIcon name="shield" size={15} />
              ตำแหน่งหมุดเป็นพิกัดประมาณ เลื่อนจากจุดจริงราว{" "}
              {report.location_precision_m} ม.
            </p>
          )}
        </section>
      )}

      {source === "individual" && report && (
        <section className="cp-map-selection-section" aria-label="ผู้รายงาน">
          <h2>ผู้รายงาน</h2>
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
              <small>
                {showReporterProfile
                  ? "แสดงตัวตนตามที่ผู้รายงานเลือก"
                  : "ผู้รายงานเลือกปิดบังตัวตน"}
              </small>
              <strong>
                {showReporterProfile
                  ? (report.display_name ?? "สมาชิกชุมชน")
                  : "ไม่เปิดเผยตัวตน"}
              </strong>
            </div>
          </div>
        </section>
      )}

      {report && (
        <details className="cp-map-selection-attribution">
          <summary className="cp-focus">
            ที่มาและข้อควรรู้ <AppIcon name="chevron" size={16} />
          </summary>
          <div>
            <p>
              {SOURCE_LABELS[source].description} ·{" "}
              {report.verification_method === "automatic"
                ? "ระบบอ่านตัวเลขจากภาพอัตโนมัติ"
                : "ข้อมูลที่ตรวจด้วยระบบเดิม"}{" "}
              ข้อมูลผู้ใช้เป็นข้อมูลเสริม ไม่ใช่สถานีทางการ
            </p>
          </div>
        </details>
      )}

      {source === "individual" && report && (
        <ReportEngagement key={report.id} report={report} />
      )}

      <Link href={href} className="cp-map-selection-card__action cp-focus">
        <span>
          {source === "official"
            ? "ดูกราฟย้อนหลังและข้อมูลเพิ่มเติม"
            : source === "sensor"
              ? "ดูสถานีชุมชนในเครือข่าย"
              : "ดูรายงานนี้ในชุมชน"}
        </span>
        <AppIcon name="chevron" size={19} />
      </Link>
    </section>
  );
}
