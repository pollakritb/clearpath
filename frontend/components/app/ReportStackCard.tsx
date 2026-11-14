"use client";

import CommunityTrustCard from "@/frontend/components/community/CommunityTrustCard";
import Image from "next/image";
import {
  stackReporterGroups,
  stackReporterAvatar,
} from "@/frontend/lib/report-stack-profiles";

import MapBottomSheet from "./MapBottomSheet";
import MapPanelReading from "./MapPanelReading";
import panel from "./MapPanel.module.css";
import AppIcon from "@/frontend/components/ui/AppIcon";

import { classifyPm25 } from "@/frontend/lib/aqi";
import type { CommunityReport, CommunityReportStack } from "@/frontend/types";

function reportTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "ไม่ทราบเวลา"
    : date.toLocaleString("th-TH", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
}

export default function ReportStackCard({
  stack,
  reports,
  onSelectReport,
  onClose,
}: {
  stack: CommunityReportStack;
  reports: CommunityReport[];
  onSelectReport: (report: CommunityReport) => void;
  onClose: () => void;
}) {
  const contributingIds = new Set(stack.contributing_report_ids);
  const selectedReading = reports.find((report) =>
    contributingIds.has(report.id),
  );
  const statusText = {
    average: `ค่าเฉลี่ยค่าล่าสุดจาก ${stack.contributing_count} คน`,
    single: selectedReading
      ? `ค่าล่าสุด · ${reportTime(selectedReading.captured_at)}`
      : "ค่าล่าสุดของผู้รายงาน",
    mixed: "ค่ารายงานแตกต่างกัน จึงไม่แสดงค่าเฉลี่ย",
    older: "ไม่มีค่าล่าสุดที่ GPS คลาดเคลื่อนไม่เกิน 50 ม.",
  }[stack.value_status];
  const color = stack.pm25 == null ? "#58716d" : classifyPm25(stack.pm25).color;
  const reporters = stackReporterGroups(stack, reports);

  return (
    <MapBottomSheet
      label="รายงานค่าฝุ่นในบริเวณเดียวกัน"
      previewHeight={64}
      className={`cp-stack-sheet ${panel.panel}`}
      initialSnap="peek"
      onClose={onClose}
      closeLabel="ปิดกลุ่มรายงาน"
      style={{ "--cp-stack-color": color } as React.CSSProperties}
      header={
        <>
          <h1 className={panel.title}>
            {stack.report_count} รายงานจาก {stack.reporter_count} คน
          </h1>
          <MapPanelReading
            value={stack.pm25}
            status={stack.pm25 == null ? statusText : undefined}
            caption={stack.pm25 != null ? statusText : undefined}
          />
          {stack.value_status !== "single" && (
            <p className={panel.time}>
              รายงานล่าสุด ·{" "}
              <time dateTime={stack.latest_captured_at}>
                {reportTime(stack.latest_captured_at)}
              </time>
            </p>
          )}
        </>
      }
    >
      <div className="cp-report-stack-card__list">
        {reporters.map(({ profile, reports: readings }) => {
          const avatar = stackReporterAvatar(profile);
          const name = profile.display_name ?? "ไม่เปิดเผยตัวตน";
          return (
            <section
              key={readings[0].id}
              className="cp-report-stack-card__reporter"
              aria-label={`ผู้รายงาน ${name}`}
            >
              <header className="cp-report-stack-card__profile">
                <span
                  className="cp-report-stack-card__avatar"
                  aria-hidden="true"
                >
                  {avatar ? (
                    <Image
                      src={avatar}
                      alt=""
                      width={36}
                      height={36}
                      unoptimized
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <AppIcon name="user" size={22} />
                  )}
                </span>
                <div>
                  <strong>{name}</strong>
                  <small>{readings.length} รายงาน</small>
                  {profile.show_reporter_profile && (
                    <>
                      <CommunityTrustCard
                        compact
                        trust={profile.community_trust}
                      />
                    </>
                  )}
                </div>
              </header>
              {readings.map((report) => (
                <button
                  key={report.id}
                  type="button"
                  className="cp-report-stack-card__item cp-focus"
                  aria-label={`ดูรายงานของ ${name} ${reportTime(report.captured_at)} ค่า ${report.pm25 ?? "ไม่ทราบ"}`}
                  onClick={() => onSelectReport(report)}
                >
                  <span>
                    <small>{reportTime(report.captured_at)}</small>

                    <em className="cp-report-stack-card__included">
                      {stack.value_status === "average" &&
                      contributingIds.has(report.id)
                        ? "ใช้ในค่าเฉลี่ย"
                        : report.id === readings[0].id
                          ? "ค่าล่าสุด"
                          : "รายงานก่อนหน้า"}
                    </em>
                  </span>
                  <b>
                    {report.pm25 ?? "—"} <small>µg/m³</small>
                  </b>
                </button>
              ))}
            </section>
          );
        })}
      </div>
      <details className={panel.details}>
        <summary className="cp-focus">การรวมรายงานและความเป็นส่วนตัว</summary>
        <p className="cp-report-stack-card__note">
          รวมรายงานใกล้กันไม่เกิน 300 ม. · เรียงตามเวลาล่าสุด · ใช้ค่าล่าสุดคนละ
          1 รายงานที่ GPS คลาดเคลื่อนไม่เกิน 50 ม. หากมีหลายคนจึงแสดงค่าเฉลี่ย ·
          ข้อมูลจากผู้ใช้เป็นข้อมูลเสริม และหมุดถูกเลื่อนเพื่อความเป็นส่วนตัว
        </p>
      </details>
    </MapBottomSheet>
  );
}
