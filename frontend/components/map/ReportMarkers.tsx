"use client";

import L from "leaflet";
import { Marker } from "react-leaflet";

import { classifyPm25 } from "@/frontend/lib/aqi";
import { communitySourceKind, SOURCE_LABELS } from "@/frontend/lib/source-kind";
import type { CommunityReport } from "@/frontend/types";

function reportIcon(
  color: string,
  value: number,
  calibrated: boolean,
  trust: number,
  selected: boolean,
) {
  const touchSize = 48;
  const size = selected ? 46 : trust >= 75 ? 42 : 39;
  const kind = calibrated ? "sensor" : "individual";
  const glyph = calibrated
    ? '<svg aria-hidden="true" viewBox="0 0 24 24"><rect x="5" y="4" width="14" height="16" rx="3"></rect><path d="M8 8h8M8 12h5"></path></svg>'
    : '<svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.4"></circle><path d="M5.5 20c.5-4 2.7-6 6.5-6s6 2 6.5 6"></path></svg>';
  return L.divIcon({
    className: `cp-marker cp-marker--community cp-marker--${kind}`,
    html: `<div class="cp-community-marker${selected ? " is-selected" : ""}" data-source="${kind}" style="--marker-aqi:${color};--marker-size:${size}px"><span aria-hidden="true"><span>${glyph}<b>${Math.round(value)}</b></span></span><i aria-hidden="true"></i>${calibrated ? '<em aria-hidden="true">✓</em>' : ""}</div>`,
    iconSize: [touchSize, touchSize],
    iconAnchor: [touchSize / 2, touchSize / 2 + size / 2 - 4],
  });
}

export default function ReportMarkers({
  reports,
  onSelect,
  selectedId,
  showSensors,
  showIndividuals,
}: {
  reports: CommunityReport[];
  onSelect?: (report: CommunityReport) => void;
  selectedId?: string | null;
  showSensors: boolean;
  showIndividuals: boolean;
}) {
  return (
    <>
      {reports.map((report) => {
        if (report.pm25 == null) return null;
        const source = communitySourceKind(report);
        if (source === "sensor" && !showSensors) return null;
        if (source === "individual" && !showIndividuals) return null;
        const cls = classifyPm25(report.pm25);
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
              report.trust_score,
              report.id === selectedId,
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
