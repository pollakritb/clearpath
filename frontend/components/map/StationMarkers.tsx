"use client";
import { flyMapToBounds } from "@/frontend/lib/map-motion";
import PriorityMarker from "./PriorityMarker";

import L from "leaflet";
import { useMemo, useState } from "react";
import { useMapEvents } from "react-leaflet";

import { classifyPm25 } from "@/frontend/lib/aqi";
import { stationMarkerDisplay } from "@/frontend/lib/station-display";
import { stationClusterSummary } from "@/frontend/lib/station-cluster-summary";
import { clusterStations } from "@/frontend/lib/station-clusters";
import { sourceTimeLabel } from "@/frontend/lib/reading-time";
import type { Station } from "@/frontend/types";

const previousBadge =
  '<i class="cp-marker-previous" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/></svg></i>';

// One station glyph for both individual readings and station groups.
const stationGlyph =
  '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M8 20h8M10 20l2-9 2 9M9.5 8.5a3.5 3.5 0 0 1 5 0M7 6a7 7 0 0 1 10 0"/></svg>';

// วงกลมตัวเลข = สถานีตรวจวัดทางการ ส่วนรายงานชุมชนใช้หมุดรูปคนคนละทรง
function stationIcon(
  aqiColor: string,
  value: number | null,
  expired: boolean,
  selected: boolean,
  previous: boolean,
) {
  const touchSize = 48;
  const size = selected ? 44 : 40;
  const label = expired ? "×" : value == null ? "—" : Math.round(value);
  return L.divIcon({
    className: "cp-marker cp-marker--station",
    html: `<div class="cp-station-marker${selected ? " is-selected" : ""}${previous ? " is-previous" : ""}" style="--marker-aqi:${aqiColor};--marker-text:#07130f;--marker-size:${size}px"><span aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 20h8M10 20l2-9 2 9M9.5 8.5a3.5 3.5 0 0 1 5 0M7 6a7 7 0 0 1 10 0"></path></svg><b>${label}</b></span>${previous ? previousBadge : ""}</div>`,
    iconSize: [touchSize, touchSize],
    iconAnchor: [touchSize / 2, touchSize / 2],
  });
}

function clusterIcon(summary: ReturnType<typeof stationClusterSummary>) {
  const color = summary.expired ? "#7b8583" : classifyPm25(summary.value).color;
  return L.divIcon({
    className: "cp-marker cp-marker--cluster",
    html: `<div class="cp-official-cluster" style="--marker-aqi:${color}">${stationGlyph}<b class="cp-cluster-value">${summary.value == null ? "×" : Math.round(summary.value)}</b>${summary.previous ? previousBadge : ""}<span class="cp-cluster-count">${summary.count}</span></div>`,
    iconSize: [56, 56],
    iconAnchor: [28, 28],
  });
}

export default function StationMarkers({
  stations,
  onSelect,
  selectedId,
}: {
  stations: Station[];
  onSelect?: (s: Station) => void;
  selectedId?: string | null;
}) {
  const [viewVersion, setViewVersion] = useState(0);
  const map = useMapEvents({
    moveend: () => setViewVersion((value) => value + 1),
    zoomend: () => setViewVersion((value) => value + 1),
  });
  const zoom = map.getZoom();
  const bounds = map.getBounds().pad(0.25);
  const visibleStations = useMemo(
    () =>
      stations.filter((station) => bounds.contains([station.lat, station.lon])),
    // viewVersion represents Leaflet viewport mutations.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stations, viewVersion],
  );
  const clusters = useMemo(() => {
    const groups = clusterStations(
      visibleStations.filter((station) => station.id !== selectedId),
      zoom,
    );
    const selected = visibleStations.find(
      (station) => station.id === selectedId,
    );
    if (selected)
      groups.push({
        id: `station:${selected.id}`,
        lat: selected.lat,
        lon: selected.lon,
        stations: [selected],
      });
    return groups;
  }, [visibleStations, zoom, selectedId]);

  return (
    <>
      {clusters.map((cluster) => {
        if (cluster.stations.length > 1) {
          const summary = stationClusterSummary(cluster.stations);
          const times = cluster.stations
            .map((station) => station.recorded_at)
            .filter(
              (time): time is string =>
                Boolean(time) && Number.isFinite(Date.parse(time!)),
            )
            .sort((a, b) => Date.parse(a) - Date.parse(b));
          const timeLabel = times.length
            ? ` · เวลาวัด ${sourceTimeLabel(times[0])}${times[0] !== times[times.length - 1] ? ` ถึง ${sourceTimeLabel(times[times.length - 1])}` : ""}`
            : " · ไม่ระบุเวลาวัด";
          const label = `${summary.count} สถานี · ค่าเฉลี่ยสถานีในกลุ่ม ${summary.value == null ? "ไม่พบตัวเลขที่ใช้แสดงได้" : Math.round(summary.value)} µg/m³ · ${summary.previous ? "มีข้อมูลเก่า" : "ข้อมูลปัจจุบัน"}${timeLabel} · แตะเพื่อขยายดูแต่ละสถานี`;

          return (
            <PriorityMarker
              priorityId={`station-cluster:${cluster.id}`}
              key={cluster.id}
              position={[cluster.lat, cluster.lon]}
              title={label}
              alt={label}
              icon={clusterIcon(summary)}
              eventHandlers={{
                click: () =>
                  flyMapToBounds(
                    map,
                    cluster.stations.map((station) => [
                      station.lat,
                      station.lon,
                    ]),
                    { padding: [36, 36], maxZoom: 10 },
                  ),
              }}
            />
          );
        }
        const s = cluster.stations[0];
        const display = stationMarkerDisplay(s);
        const cls = classifyPm25(display.value);
        const stationName = s.name_th ?? s.name_en ?? s.id;
        const markerLabel = `${stationName} PM2.5 ${s.pm25 ?? "ไม่มีข้อมูล"} ไมโครกรัมต่อลูกบาศก์เมตร ${
          display.previous
            ? `ข้อมูลก่อนหน้า ${s.age_minutes} นาที ไม่ใช่ค่าปัจจุบัน`
            : display.value == null
              ? "ข้อมูลก่อนหน้า หรือไม่ทราบเวลาข้อมูล"
              : cls.level
        }`;
        return (
          <PriorityMarker
            priorityId={`station:${s.id}`}
            key={s.id}
            position={[s.lat, s.lon]}
            title={markerLabel}
            alt={markerLabel}
            icon={stationIcon(
              display.value == null ? "#7b8583" : cls.color,
              s.pm25,
              display.value == null && s.data_status === "expired",
              s.id === selectedId,
              display.previous,
            )}
            eventHandlers={{ click: () => onSelect?.(s) }}
          />
        );
      })}
    </>
  );
}
