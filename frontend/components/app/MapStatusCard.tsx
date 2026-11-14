"use client";

import CommunityTrustCard from "@/frontend/components/community/CommunityTrustCard";
import RankEmblem from "@/frontend/components/community/RankEmblem";
import ParticipationBadge from "@/frontend/components/community/ParticipationBadge";
import { useRef, useState } from "react";
import MapBottomSheet from "./MapBottomSheet";
import MapPanelReading from "./MapPanelReading";
import StationInsights from "./StationInsights";
import { readingAgeLabel, sourceTimeLabel } from "@/frontend/lib/reading-time";
import {
  currentStationValue,
  stationMarkerDisplay,
} from "@/frontend/lib/station-display";
import panel from "./MapPanel.module.css";

import SettingsLink from "@/frontend/components/app/SettingsLink";

import ReportEvidencePanel from "@/frontend/components/community/ReportEvidencePanel";
import ReportEngagement from "@/frontend/components/community/ReportEngagement";
import AppIcon from "@/frontend/components/ui/AppIcon";
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
  onClose,
  onBackToPlace,
  backLabel = "กลับไปยังสถานที่",
  onOpenHistory,
  onOpenForecast,
  historicalAt = null,
}: MapStatusCardProps) {
  const photoDialogRef = useRef<HTMLDialogElement>(null);
  const [expandedStation, setExpandedStation] = useState<string | null>(null);
  const [evidenceImage, setEvidenceImage] = useState<string | null>(null);
  const photoButtonRef = useRef<HTMLButtonElement>(null);
  const [actionsContainer, setActionsContainer] =
    useState<HTMLDivElement | null>(null);
  const [expandSignal, setExpandSignal] = useState(0);
  const selection = report ?? station;

  if (!selection)
    return (
      <div className={panel.sync} role="status" aria-label="เวลาซิงก์ข้อมูล">
        <time dateTime={updatedAt ?? undefined}>
          {updatedAt
            ? `ซิงก์ ${formatTime(updatedAt)} น.`
            : "กำลังซิงก์ข้อมูล…"}
        </time>
      </div>
    );

  const isCommunity = report != null;
  const source = report ? communitySourceKind(report) : "official";
  const value = isCommunity ? report.pm25 : station?.pm25;
  const expired =
    !historicalAt &&
    (report
      ? report.is_fresh === false
      : !station || currentStationValue(station) == null);
  const showPreviousColour = Boolean(
    !report &&
    station &&
    !historicalAt &&
    stationMarkerDisplay(station).previous,
  );
  const classification = classifyPm25(
    expired && !showPreviousColour ? null : value,
  );
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
        previewHeight={64}
        label={selectionLabel}
        onClose={onClose}
        closeLabel="ปิดรายละเอียดจุดบนแผนที่"
        className={`cp-station-sheet ${panel.panel}`}
        initialSnap="peek"
        onSnapChange={(snap) =>
          setExpandedStation(snap === "full" ? station.id : null)
        }
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
              showPreviousColour={showPreviousColour}
              caption={
                <>
                  เวลาข้อมูลต้นทาง ·{" "}
                  <time dateTime={station.recorded_at ?? undefined}>
                    {sourceTimeLabel(station.recorded_at)}
                  </time>
                  {!historicalAt &&
                    ` · ${readingAgeLabel(station.age_minutes)}`}
                </>
              }
            />
            {expired && (
              <p className={panel.address}>
                ข้อมูลก่อนหน้า ไม่ใช้คำนวณค่าปัจจุบัน
              </p>
            )}
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
        <StationInsights
          key={`${station.id}:${station.recorded_at}:${historicalAt ?? "now"}`}
          station={station}
          enabled={expandedStation === station.id}
          historicalAt={historicalAt}
        />
      </MapBottomSheet>
    );
  }

  return (
    <MapBottomSheet
      key={report?.id}
      expandSignal={expandSignal}
      previewHeight={64}
      label={selectionLabel}
      onClose={onClose}
      closeLabel="ปิดรายละเอียดจุดบนแผนที่"
      className={`cp-user-report-sheet ${panel.panel} ${panel.reportPanel}`}
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
          {source === "individual" && report && !historicalAt && (
            <div ref={setActionsContainer} className={panel.reportActions} />
          )}
        </>
      }
    >
      {source === "individual" && report && !historicalAt && (
        <ReportEngagement
          key={report.id}
          report={report}
          actionsContainer={actionsContainer}
          onRevealDetails={() => setExpandSignal((value) => value + 1)}
          evidenceReady={Boolean(
            report.image_url && evidenceImage === report.image_url,
          )}
        />
      )}
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
              className={`${panel.photo} cp-map-report-photo cp-focus`}
              aria-label="เปิดดูภาพเครื่องวัดจากรายงานนี้"
              onClick={() => photoDialogRef.current?.showModal()}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                onLoad={() => setEvidenceImage(report.image_url)}
                onError={() => setEvidenceImage(null)}
                className={panel.reportImage}
                src={report.image_url}
                alt="ภาพหน้าจอเครื่องวัด PM2.5 จากผู้รายงาน"
                width={600}
                height={450}
                loading="lazy"
                referrerPolicy="no-referrer"
              />
              <span className={panel.imageHint}>
                <AppIcon name="search" size={16} /> ดูภาพเต็มจอ
              </span>
            </button>
            <dialog
              ref={photoDialogRef}
              className={`cp-map-photo-dialog ${panel.fullPhoto}`}
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
        <section
          className={`cp-map-selection-section ${panel.reporter}`}
          aria-label="ผู้รายงาน"
        >
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
                    <SettingsLink href={`/members/${report.member_id}`}>
                      {report.display_name ?? "สมาชิกชุมชน"}
                    </SettingsLink>
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
                <>
                  <CommunityTrustCard compact trust={report.community_trust} />
                </>
              )}
            </div>
          </div>
        </section>
      )}

      {source === "individual" && report && (
        <ReportEvidencePanel report={report} />
      )}
    </MapBottomSheet>
  );
}
