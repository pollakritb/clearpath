"use client";
import PriorityMarker from "./PriorityMarker";

import L from "leaflet";
import { useState } from "react";
import { useMapEvents } from "react-leaflet";
import { clusterMapPoints } from "@/frontend/lib/station-clusters";

import { classifyPm25 } from "@/frontend/lib/aqi";
import { formatCommunityArea } from "@/frontend/lib/community-location";
import {
  stackReporterGroups,
  stackReporterAvatar,
} from "@/frontend/lib/report-stack-profiles";
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
  const reporters = stackReporterGroups(stack, reports);
  const faces = reporters
    .slice(0, 3)
    .map(({ profile: report }, index) => {
      const avatar = stackReporterAvatar(report);
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
    html: `<div class="cp-report-stack-marker${selected ? " is-selected" : ""}" style="--marker-aqi:${color}"><span class="cp-report-stack-marker__faces cp-report-stack-marker__faces--${Math.min(reporters.length, 3)}" aria-hidden="true">${faces}</span><strong class="cp-report-stack-marker__value">${value}</strong><span class="cp-report-stack-marker__count">${overflow > 0 ? `+${overflow} คน · ` : ""}${stack.report_count} รายงาน</span></div>`,
    iconSize: [60, 64],
    iconAnchor: [30, 32],
  });
}

function reportGroupSummary(reports: CommunityReport[]) {
  const values = reports
    .filter(
      (report) =>
        report.pm25 != null && report.pm25 >= 0 && Number.isFinite(report.pm25),
    )
    .map((report) => report.pm25!);
  return {
    value: values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : null,
    previous: reports.some(
      (report) => !report.is_fresh || (report.age_minutes ?? Infinity) > 180,
    ),
  };
}

function reportGroupIcon(reports: CommunityReport[]) {
  const { value, previous } = reportGroupSummary(reports);
  const color = previous ? "#7b8583" : classifyPm25(value).color;
  return L.divIcon({
    className: "cp-marker cp-marker--community-group",
    html: `<div class="cp-community-map-group" style="--marker-aqi:${color}"><svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.4"/><path d="M5.5 20c.5-4 2.7-6 6.5-6s6 2 6.5 6"/></svg><strong>${value == null ? "×" : Math.round(value)}</strong>${previous ? '<span class="cp-community-map-group__clock"><svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/></svg></span>' : ""}<span class="cp-community-map-group__count">${reports.length}</span></div>`,
    iconSize: [56, 56],
    iconAnchor: [28, 28],
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
  const [, redraw] = useState(0);
  const map = useMapEvents({
    zoomend: () => redraw((v) => v + 1),
  });
  const groupedReportIds = new Set(stacks.flatMap((stack) => stack.report_ids));
  const individualReports = reports.filter(
    (report) =>
      report.pm25 != null &&
      Number.isFinite(report.pm25) &&
      report.pm25 >= 0 &&
      !groupedReportIds.has(report.id) &&
      communitySourceKind(report) === "individual",
  );
  const groups = clusterMapPoints(
    individualReports.filter((report) => report.id !== selectedId),
    map.getZoom(),
  );
  const selected = individualReports.find((report) => report.id === selectedId);
  if (selected)
    groups.push({
      id: `report:${selected.id}`,
      lat: selected.lat,
      lon: selected.lon,
      stations: [selected],
    });
  return (
    <>
      {groups
        .filter((group) => group.stations.length > 1)
        .map((group) => (
          <PriorityMarker
            key={group.id}
            priorityId={`report-group:${group.id}`}
            position={[group.lat, group.lon]}
            icon={reportGroupIcon(group.stations)}
            zIndexOffset={1500}
            title={`${group.stations.length} รายงานชุมชน · ${`ค่าเฉลี่ยรายงานในกลุ่ม ${Math.round(reportGroupSummary(group.stations).value!)} µg/m³ · ${reportGroupSummary(group.stations).previous ? "มีข้อมูลเก่า" : "ข้อมูลปัจจุบัน"}`} · แตะเพื่อดูรายงานและเวลาวัด`}
            alt={`กลุ่ม ${group.stations.length} รายงานชุมชน`}
            eventHandlers={{
              click: () =>
                map.fitBounds(
                  group.stations.map((report) => [report.lat, report.lon]),
                  { padding: [48, 48], maxZoom: 14 },
                ),
            }}
          />
        ))}
      {stacks.map((stack) => (
        <PriorityMarker
          priorityId={`stack:${stack.id}`}
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
      {groups
        .filter((group) => group.stations.length === 1)
        .map(({ stations: [report] }) => {
          if (report.pm25 == null || groupedReportIds.has(report.id))
            return null;
          const source = communitySourceKind(report);
          if (source !== "individual") return null;
          const cls = classifyPm25(report.pm25);
          const avatarUrl = publicReporterAvatar(report);
          const area = formatCommunityArea(report);
          const label = `${SOURCE_LABELS[source].label} ${area} PM2.5 ${report.pm25} ไมโครกรัมต่อลูกบาศก์เมตร ${cls.level}`;
          return (
            <PriorityMarker
              priorityId={`report:${report.id}`}
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
              zIndexOffset={report.id === selectedId ? 1700 : 1500}
              eventHandlers={{ click: () => onSelect?.(report) }}
            />
          );
        })}
    </>
  );
}
