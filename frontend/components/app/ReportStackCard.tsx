"use client";

import Image from "next/image";
import {
  stackReporterGroups,
  stackReporterAvatar,
} from "@/frontend/lib/report-stack-profiles";
import ReporterTrustCard from "@/frontend/components/community/ReporterTrustCard";
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
  const reporters = stackReporterGroups(stack, reports);

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
                      {profile.show_reporter_profile &&
                        profile.participation_rank && (
                          <ParticipationBadge
                            rank={profile.participation_rank}
                          />
                        )}
                      {profile.show_reporter_profile && (
                        <ReporterTrustCard
                          compact
                          trust={profile.reporter_trust}
                        />
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
                        <small>แตะดูภาพและรายละเอียด</small>
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
                </section>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
