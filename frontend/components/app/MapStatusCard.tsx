"use client";

import RankEmblem from "@/frontend/components/community/RankEmblem";
import ReporterTrustCard from "@/frontend/components/community/ReporterTrustCard";
import ParticipationBadge from "@/frontend/components/community/ParticipationBadge";
import { useRef } from "react";
import MapBottomSheet from "./MapBottomSheet";
import MapPanelReading from "./MapPanelReading";
import panel from "./MapPanel.module.css";

import Link from "next/link";

import ReportEvidencePanel from "@/frontend/components/community/ReportEvidencePanel";
import ReportEngagement from "@/frontend/components/community/ReportEngagement";
import AppIcon from "@/frontend/components/ui/AppIcon";
import SourceBadge from "@/frontend/components/ui/SourceBadge";
import { classifyPm25 } from "@/frontend/lib/aqi";
import { formatCommunityArea } from "@/frontend/lib/community-location";
import { publicReporterAvatar } from "@/frontend/lib/reporter-profile";
import { communitySourceKind, SOURCE_LABELS } from "@/frontend/lib/source-kind";
import type { CommunityReport, Station } from "@/frontend/types";

interface MapStatusCardProps {
  station: Station | null;
  report: CommunityReport | null;
  updatedAt: string | null;
  freshStationCount?: number;
  onClose: () => void;
  onBackToPlace?: () => void;
  backLabel?: string;
  onOpenHistory?: () => void;
  onOpenForecast?: () => void;
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
  if (period === "unknown") return "ยังไม่ทราบช่วงเฉลี่ย";
  if (period === "1_minute") return "เฉลี่ย 1 นาที";
  if (period === "5_minutes") return "เฉลี่ย 5 นาที";
  return "ค่า ณ ขณะวัด";
}

export default function MapStatusCard({
  station,
  report,
  updatedAt,
  freshStationCount,
  onClose,
  onBackToPlace,
  backLabel = "กลับไปยังสถานที่",
  onOpenHistory,
  onOpenForecast,
  historicalAt = null,
}: MapStatusCardProps) {
  const photoDialogRef = useRef<HTMLDialogElement>(null);
  const photoButtonRef = useRef<HTMLButtonElement>(null);
  const selection = report ?? station;

  if (!selection) {
    return (
      <MapBottomSheet
        label="สถานะแผนที่ค่าฝุ่นปัจจุบัน"
        className="cp-current-sheet"
        initialSnap="peek"
        onClose={onClose}
        showClose={false}
        header={
          <div className="cp-map-current-summary">
            <span className="cp-map-current-dock__icon" aria-hidden="true">
              <AppIcon name="activity" size={19} />
            </span>
            <span className="cp-map-current-dock__copy">
              <strong>ค่าฝุ่นปัจจุบัน</strong>
              <small>
                {freshStationCount === 0
                  ? "Air4Thai ยังไม่มีค่าตรวจวัดใหม่ภายใน 1 ชม."
                  : "Air4Thai · ข้อมูลชุมชนที่ผ่านการตรวจ"}
              </small>
            </span>
            <span className="cp-map-current-dock__actions">
              <time
                className={
                  freshStationCount === 0
                    ? undefined
                    : "cp-map-current-dock__time"
                }
                dateTime={updatedAt ?? undefined}
              >
                <i aria-hidden="true" />
                {updatedAt
                  ? `ซิงก์ ${formatTime(updatedAt)} น.`
                  : "กำลังอัปเดต"}
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
          </div>
        }
      >
        <p>
          เลือกหมุดสถานี รายงานจากชุมชน หรือค้นหาสถานที่
          เพื่อดูค่าฝุ่นและเวลาตรวจวัด
        </p>
        <p>
          ข้อมูล Air4Thai เป็นค่าตรวจวัดจากสถานี
          ส่วนรายงานจากผู้ใช้เป็นข้อมูลเสริม
        </p>
      </MapBottomSheet>
    );
  }

  const isCommunity = report != null;
  const source = report ? communitySourceKind(report) : "official";
  const value = isCommunity ? report.pm25 : station?.pm25;
  const expired =
    !historicalAt &&
    (report ? report.is_fresh === false : station?.data_status === "expired");
  const classification = classifyPm25(expired ? null : value);
  const reporterAvatar = report ? publicReporterAvatar(report) : null;
  const showReporterProfile = Boolean(
    report?.source_type === "individual" && report.show_reporter_profile,
  );
  const stationName = station
    ? (station.name_th ?? station.name_en ?? station.id)
    : "";
  const communityArea = report ? formatCommunityArea(report) : "";
  const isDemo = report?.policy_version === "demo-v1";
  const selectionLabel =
    source === "sensor"
      ? "รายละเอียดสถานีเซนเซอร์ชุมชน"
      : isCommunity
        ? "รายละเอียดรายงานจากบุคคล"
        : "รายละเอียดสถานีตรวจวัดทางการ";

  if (station && !report) {
    return (
      <MapBottomSheet
        label={selectionLabel}
        onClose={onClose}
        closeLabel="ปิดรายละเอียดจุดบนแผนที่"
        className={`cp-station-sheet ${panel.panel}`}
        initialSnap="peek"
        style={
          {
            "--cp-selection-color": classification.color,
            "--cp-selection-tint": classification.tint,
          } as React.CSSProperties
        }
        header={
          <>
            {onBackToPlace && (
              <button
                type="button"
                className="cp-map-selection-card__back cp-focus"
                onClick={onBackToPlace}
              >
                ← {backLabel}
              </button>
            )}
            <h1 className={panel.title}>{stationName}</h1>
            <p className={panel.context}>
              สถานี Air4Thai{historicalAt ? " · ย้อนหลัง" : ""}
            </p>
            <MapPanelReading
              value={value}
              stale={expired}
              caption={
                <>
                  {historicalAt ? "เวลาตรวจวัด" : "ตรวจวัดล่าสุด"} ·{" "}
                  <time dateTime={station.recorded_at ?? undefined}>
                    {formatReportDate(station.recorded_at)}
                  </time>
                </>
              }
            />
            {station && (onOpenHistory || onOpenForecast) && (
              <div className="cp-pin-time-actions">
                {onOpenHistory && (
                  <button
                    type="button"
                    className="cp-focus"
                    onClick={onOpenHistory}
                    aria-label="ดูย้อนหลังของสถานีนี้"
                  >
                    <AppIcon name="clock" size={17} /> ย้อนหลัง
                  </button>
                )}
                {onOpenForecast && (
                  <button
                    type="button"
                    className="cp-focus"
                    onClick={onOpenForecast}
                    aria-label="ดูพยากรณ์ของสถานีนี้"
                  >
                    <AppIcon name="wind" size={17} /> พยากรณ์
                  </button>
                )}
              </div>
            )}
          </>
        }
      >
        <section className={panel.section}>
          <h2>ข้อมูลสถานี</h2>
          <p className={panel.address}>
            {station.province ?? "ประเทศไทย"} · รหัสสถานี {station.id}
          </p>
          <SourceBadge kind="official" compact />
          <p className={panel.address}>
            ค่าตรวจวัดจาก Air4Thai ตามเวลาที่ระบุบนรายงาน
          </p>
        </section>
      </MapBottomSheet>
    );
  }

  return (
    <MapBottomSheet
      label={selectionLabel}
      onClose={onClose}
      closeLabel="ปิดรายละเอียดจุดบนแผนที่"
      className={`cp-user-report-sheet ${panel.panel}`}
      initialSnap="peek"
      style={
        {
          "--cp-selection-color": classification.color,
          "--cp-selection-tint": classification.tint,
        } as React.CSSProperties
      }
      header={
        <>
          {onBackToPlace && (
            <button
              type="button"
              className="cp-map-selection-card__back cp-focus"
              onClick={onBackToPlace}
            >
              ← {backLabel}
            </button>
          )}
          <h1 className={panel.title}>{communityArea}</h1>
          <p className={panel.context}>
            <span>{SOURCE_LABELS[source].label}</span>
            {source === "individual" &&
              ` · ${showReporterProfile ? (report?.display_name ?? "สมาชิก ClearPath") : "ไม่เปิดเผยตัวตน"}`}
            {isDemo && <span> · ข้อมูลตัวอย่าง</span>}
          </p>
          <MapPanelReading
            value={value}
            stale={expired}
            caption={
              <>
                วัด ·{" "}
                <time dateTime={report?.captured_at}>
                  {formatReportDate(report?.captured_at ?? null)}
                </time>
                {historicalAt ? " · ย้อนหลัง" : ""}
              </>
            }
          />
        </>
      }
    >
      <section
        className="cp-map-selection-section cp-map-report-evidence"
        aria-label="ข้อมูลรายงานค่าฝุ่น"
      >
        <div className="cp-map-report-section-heading">
          <div>
            <h2>หลักฐานและการตรวจวัด</h2>
            <p>
              ตัวเลข PM2.5 ที่ระบบอ่านจากภาพเครื่องวัด ·{" "}
              {report?.capture_source === "gallery"
                ? "ภาพจากคลัง"
                : "ถ่ายภาพใหม่"}
            </p>
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
        <details className={panel.details}>
          <summary className="cp-focus">
            ข้อมูลเครื่องวัดและการตรวจข้อมูล
          </summary>
          <div className="cp-map-selection-meta">
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
        </details>
      </section>

      {source === "individual" && report && (
        <section className="cp-map-selection-section" aria-label="ผู้รายงาน">
          <h2>ผู้รายงาน</h2>
          <div
            className="cp-map-reporter-profile"
            data-hidden={!showReporterProfile}
          >
            <span className="cp-map-reporter-avatar" aria-hidden="true">
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
                <AppIcon name="user" size={22} />
              )}
              {showReporterProfile && report.participation_rank && (
                <RankEmblem rank={report.participation_rank} decorative />
              )}
            </span>
            <div>
              <small>
                {showReporterProfile
                  ? "แสดงตัวตนตามที่ผู้รายงานเลือก"
                  : "ผู้รายงานเลือกปิดบังตัวตน"}
              </small>
              <strong>
                {showReporterProfile ? (
                  report.member_id ? (
                    <Link href={`/members/${report.member_id}`}>
                      {report.display_name ?? "สมาชิกชุมชน"}
                    </Link>
                  ) : (
                    (report.display_name ?? "สมาชิกชุมชน")
                  )
                ) : (
                  (report.display_name ?? "ไม่เปิดเผยตัวตน")
                )}
              </strong>
              {showReporterProfile && report.participation_rank && (
                <ParticipationBadge rank={report.participation_rank} />
              )}
              {showReporterProfile && (
                <ReporterTrustCard compact trust={report.reporter_trust} />
              )}
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
        <ReportEvidencePanel report={report} />
      )}
      {source === "individual" && report && !historicalAt && (
        <ReportEngagement key={report.id} report={report} />
      )}

      {!station && (
        <Link
          href="/community"
          className="cp-map-selection-card__action cp-focus"
        >
          <span>
            {source === "sensor"
              ? "ดูสถานีชุมชนในเครือข่าย"
              : "ดูรายงานนี้ในชุมชน"}
          </span>
          <AppIcon name="chevron" size={19} />
        </Link>
      )}
    </MapBottomSheet>
  );
}
