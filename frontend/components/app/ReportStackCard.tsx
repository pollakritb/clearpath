"use client";

import ParticipationBadge from "@/frontend/components/community/ParticipationBadge";

import { useState } from "react";

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
  const [expanded, setExpanded] = useState(false);
  const statusText = {
    average: `ค่าเฉลี่ยจาก ${stack.contributing_count} รายงานที่ GPS คลาดเคลื่อนไม่เกิน 50 ม.`,
    single: "ค่าจาก 1 รายงานที่ GPS คลาดเคลื่อนไม่เกิน 50 ม.",
    mixed: "ค่ารายงานแตกต่างกัน จึงไม่แสดงค่าเฉลี่ย",
    older: "ไม่มีรายงานที่ GPS คลาดเคลื่อนไม่เกิน 50 ม.",
  }[stack.value_status];
  const color = stack.pm25 == null ? "#58716d" : classifyPm25(stack.pm25).color;
  const contributingIds = new Set(stack.contributing_report_ids);

  return (
    <section
      className="cp-report-stack-card"
      aria-label="รายงานค่าฝุ่นในบริเวณเดียวกัน"
      data-expanded={expanded}
      style={{ "--cp-stack-color": color } as React.CSSProperties}
    >
      <div className="cp-map-selection-card__handle" aria-hidden />
      <button
        type="button"
        className="cp-map-selection-card__close cp-focus"
        onClick={onClose}
        aria-label="ปิดกลุ่มรายงาน"
      >
        <AppIcon name="close" size={19} />
      </button>
      <header>
        <small>รายงานใกล้กัน · ไม่เกิน 300 ม.</small>
        <h1>
          {stack.report_count} รายงานจาก {stack.reporter_count} คน
        </h1>
      </header>
      <div className="cp-report-stack-card__summary">
        {stack.pm25 != null && (
          <strong>
            {stack.pm25} <small>µg/m³ PM2.5</small>
          </strong>
        )}
        <span>{statusText}</span>
      </div>
      <button
        type="button"
        className="cp-report-stack-card__toggle cp-focus"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        {expanded ? "ย่อรายการ" : `ดูทั้ง ${stack.report_count} รายงาน`}
        <AppIcon
          name="chevron"
          size={17}
          className={expanded ? "is-open" : ""}
        />
      </button>
      {expanded && (
        <>
          <p className="cp-report-stack-card__note">
            เรียงตามเวลาล่าสุด · เฉลี่ยทุกรายงานในกลุ่มที่ GPS
            คลาดเคลื่อนไม่เกิน 50 ม. รวมรายงานจากคนเดียวกัน ·
            ข้อมูลจากผู้ใช้เป็นข้อมูลเสริม และหมุดถูกเลื่อนเพื่อความเป็นส่วนตัว
          </p>
          <div className="cp-report-stack-card__list">
            {reports.map((report) => (
              <button
                key={report.id}
                type="button"
                className="cp-report-stack-card__item cp-focus"
                onClick={() => onSelectReport(report)}
              >
                <span>
                  <strong>{report.display_name ?? "ไม่เปิดเผยตัวตน"}</strong>
                  {report.show_reporter_profile &&
                    report.participation_rank && (
                      <ParticipationBadge rank={report.participation_rank} />
                    )}
                  <small>
                    {reportTime(report.captured_at)} · แตะดูภาพและรายละเอียด
                  </small>
                  {stack.value_status === "average" &&
                    contributingIds.has(report.id) && (
                      <em className="cp-report-stack-card__included">
                        ใช้ในค่าเฉลี่ย
                      </em>
                    )}
                </span>
                <b>
                  {report.pm25 ?? "—"} <small>µg/m³</small>
                </b>
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
