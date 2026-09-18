"use client";

import L from "leaflet";
import { Marker } from "react-leaflet";

import { classifyPm25 } from "@/frontend/lib/aqi";
import { publicReporterAvatar } from "@/frontend/lib/reporter-profile";
import { communitySourceKind, SOURCE_LABELS } from "@/frontend/lib/source-kind";
import type { CommunityReport } from "@/frontend/types";

function reportIcon(
  color: string,
  value: number,
  calibrated: boolean,
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
    html: `<div class="cp-community-marker${selected ? " is-selected" : ""}" data-source="individual" data-profile="${Boolean(avatarUrl)}" data-calibrated="${calibrated}" style="--marker-aqi:${color};--marker-text:#07130f;--marker-size:${size}px">${content}${calibrated ? '<em aria-hidden="true">✓</em>' : ""}</div>`,
    iconSize: [touchSize, touchSize],
    iconAnchor: [touchSize / 2, touchSize / 2 + size / 2 - 4],
  });
}

export default function ReportMarkers({
  reports,
  onSelect,
  selectedId,
}: {
  reports: CommunityReport[];
  onSelect?: (report: CommunityReport) => void;
  selectedId?: string | null;
}) {
  return (
    <>
      {reports.map((report) => {
        if (report.pm25 == null) return null;
        const source = communitySourceKind(report);
        if (source !== "individual") return null;
        const cls = classifyPm25(report.pm25);
        const avatarUrl = publicReporterAvatar(report);
        const area =
          [report.subdistrict, report.district, report.province]
            .filter(Boolean)
            .join(" ") || "พื้นที่โดยประมาณ";
        const label = `${SOURCE_LABELS[source].label} ${area} PM2.5 ${report.pm25} ไมโครกรัมต่อลูกบาศก์เมตร ${cls.level}`;
        return (
          <Marker
            key={report.id}
            position={[report.lat, report.lon]}
            icon={reportIcon(
              cls.color,
              report.pm25,
              report.device_calibrated,
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
