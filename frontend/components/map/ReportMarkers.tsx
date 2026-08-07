"use client";

import L from "leaflet";
import { Marker } from "react-leaflet";

import { classifyPm25 } from "@/frontend/lib/aqi";
import type { CommunityReport } from "@/frontend/types";

function reportIcon(color: string, trust: number, selected: boolean) {
  const touchSize = 44;
  const size = selected ? 38 : trust >= 75 ? 34 : 31;
  return L.divIcon({
    className: "cp-marker cp-marker--community",
    html: `<div class="cp-community-marker${selected ? " is-selected" : ""}" style="--marker-aqi:${color};--marker-size:${size}px"><span><svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.4"></circle><path d="M5.5 20c.5-4 2.7-6 6.5-6s6 2 6.5 6"></path></svg></span><i aria-hidden="true"></i></div>`,
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
        const cls = classifyPm25(report.pm25);
        const area =
          [report.subdistrict, report.district, report.province]
            .filter(Boolean)
            .join(" ") || "พื้นที่โดยประมาณ";
        const label = `รายงานจากประชาชน ${area} PM2.5 ${report.pm25} ไมโครกรัมต่อลูกบาศก์เมตร ${cls.level}`;
        return (
          <Marker
            key={report.id}
            position={[report.lat, report.lon]}
            icon={reportIcon(
              cls.color,
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
