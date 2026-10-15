"use client";

import L from "leaflet";
import { Marker } from "react-leaflet";

import { classifyPm25 } from "@/frontend/lib/aqi";
import { formatCommunityArea } from "@/frontend/lib/community-location";
import { isCommunityStackDemoMode } from "@/frontend/lib/demo-community";
import { publicReporterAvatar } from "@/frontend/lib/reporter-profile";
import { communitySourceKind, SOURCE_LABELS } from "@/frontend/lib/source-kind";
import type { CommunityReport, CommunityReportStack } from "@/frontend/types";

function reportIcon(
  color: string,
  value: number,
  selected: boolean,
  avatarUrl: string | null,
) {
  const touchSize = 48;
  const size = selected ? 46 : 40;
  const glyph =
    '<svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.4"></circle><path d="M5.5 20c.5-4 2.7-6 6.5-6s6 2 6.5 6"></path></svg>';
  const roundedValue = Math.round(value);
  const content = `<span aria-hidden="true"><span class="cp-community-marker__portrait">${
    avatarUrl
      ? `<img src="${avatarUrl.replaceAll("&", "&amp;").replaceAll('"', "&quot;")}" alt="" referrerpolicy="no-referrer" loading="lazy">`
      : glyph
  }</span></span><b class="cp-community-marker__value" aria-hidden="true">${roundedValue}</b>`;
  return L.divIcon({
    className: "cp-marker cp-marker--community cp-marker--individual",
    html: `<div class="cp-community-marker${selected ? " is-selected" : ""}" data-source="individual" data-profile="${Boolean(avatarUrl)}" style="--marker-aqi:${color};--marker-text:#07130f;--marker-size:${size}px">${content}</div>`,
    iconSize: [touchSize, touchSize],
    iconAnchor: [touchSize / 2, touchSize / 2],
  });
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

function stackIcon(
  stack: CommunityReportStack,
  reports: CommunityReport[],
  selected: boolean,
) {
  const color = stack.pm25 == null ? "#58716d" : classifyPm25(stack.pm25).color;
  const value = stack.pm25 == null ? "—" : String(Math.round(stack.pm25));
  const uniqueReporters = new Map<string, CommunityReport>();
  for (const id of stack.report_ids) {
    const report = reports.find((entry) => entry.id === id);
    if (report && !uniqueReporters.has(report.user_id)) {
      uniqueReporters.set(report.user_id, report);
    }
  }
  const faces = [...uniqueReporters.values()]
    .slice(0, 3)
    .map((report, index) => {
      const demoAvatar =
        isCommunityStackDemoMode() &&
        report.policy_version === "demo-v1" &&
        ["/demo/avatar-kan.svg", "/demo/avatar-mint.svg"].includes(
          report.reporter_avatar_url ?? "",
        )
          ? report.reporter_avatar_url
          : null;
      const avatar = publicReporterAvatar(report) ?? demoAvatar;
      const initial = report.show_reporter_profile
        ? (report.display_name?.trim().charAt(0) ?? "")
        : "";
      const content = avatar
        ? `<img src="${escapeHtml(avatar)}" alt="" referrerpolicy="no-referrer">`
        : initial
          ? `<b>${escapeHtml(initial)}</b>`
          : '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.3"/><path d="M5 21c.5-4.5 2.8-6.5 7-6.5s6.5 2 7 6.5"/></svg>';
      return `<span class="cp-report-stack-marker__face cp-report-stack-marker__face--${index + 1}">${content}</span>`;
    })
    .join("");
  const overflow = Math.max(0, stack.reporter_count - 3);
  return L.divIcon({
    className: "cp-marker cp-marker--report-stack",
    html: `<div class="cp-report-stack-marker${selected ? " is-selected" : ""}" style="--marker-aqi:${color}"><span class="cp-report-stack-marker__faces cp-report-stack-marker__faces--${Math.min(uniqueReporters.size, 3)}" aria-hidden="true">${faces}</span><strong class="cp-report-stack-marker__value">${value}</strong><span class="cp-report-stack-marker__count">${overflow > 0 ? `+${overflow} คน · ` : ""}${stack.report_count} รายงาน</span></div>`,
    iconSize: [60, 60],
    iconAnchor: [30, 30],
  });
}

export default function ReportMarkers({
  reports,
  stacks,
  onSelect,
  onSelectStack,
  selectedId,
  selectedStackId,
}: {
  reports: CommunityReport[];
  stacks: CommunityReportStack[];
  onSelect?: (report: CommunityReport) => void;
  onSelectStack?: (stack: CommunityReportStack) => void;
  selectedId?: string | null;
  selectedStackId?: string | null;
}) {
  const groupedReportIds = new Set(stacks.flatMap((stack) => stack.report_ids));
  return (
    <>
      {stacks.map((stack) => (
        <Marker
          key={stack.id}
          position={[stack.lat, stack.lon]}
          icon={stackIcon(stack, reports, stack.id === selectedStackId)}
          title={`${stack.report_count} รายงานจาก ${stack.reporter_count} คน${stack.pm25 == null ? "" : ` · PM2.5 ${stack.pm25} µg/m³`}`}
          alt={`${stack.report_count} รายงานในบริเวณเดียวกัน`}
          zIndexOffset={1500}
          eventHandlers={{
            click: (event) => {
              L.DomEvent.stopPropagation(event.originalEvent);
              onSelectStack?.(stack);
            },
          }}
        />
      ))}
      {reports.map((report) => {
        if (report.pm25 == null || groupedReportIds.has(report.id)) return null;
        const source = communitySourceKind(report);
        if (source !== "individual") return null;
        const cls = classifyPm25(report.pm25);
        const avatarUrl = publicReporterAvatar(report);
        const area = formatCommunityArea(report);
        const label = `${SOURCE_LABELS[source].label} ${area} PM2.5 ${report.pm25} ไมโครกรัมต่อลูกบาศก์เมตร ${cls.level}`;
        return (
          <Marker
            key={report.id}
            position={[report.lat, report.lon]}
            icon={reportIcon(
              cls.color,
              report.pm25,
              report.id === selectedId,
              avatarUrl,
            )}
            title={label}
            alt={label}
            eventHandlers={{ click: () => onSelect?.(report) }}
          />
        );
      })}
    </>
  );
}
