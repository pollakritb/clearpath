"use client";
import PriorityMarker from "./PriorityMarker";

import L from "leaflet";
import { useMemo, useState } from "react";
import { useMapEvents } from "react-leaflet";

import { classifyPm25 } from "@/frontend/lib/aqi";
import {
  currentStationValue,
  stationMarkerDisplay,
} from "@/frontend/lib/station-display";
import { clusterStations } from "@/frontend/lib/station-clusters";
import type { Station } from "@/frontend/types";

const previousBadge =
  '<i class="cp-marker-previous" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/></svg></i>';

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

function clusterIcon(count: number, aqiColor: string, previous: boolean) {
  return L.divIcon({
    className: "cp-marker cp-marker--cluster",
    html: `<div class="cp-official-cluster${previous ? " is-previous" : ""}" style="--marker-aqi:${aqiColor};--marker-text:#07130f"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M8 20h8M10 20l2-9 2 9M9.5 8.5a3.5 3.5 0 0 1 5 0M7 6a7 7 0 0 1 10 0"></path></svg><span class="cp-cluster-count"><b>${count}</b><small>สถานี</small></span>${previous ? previousBadge : ""}</div>`,
    iconSize: [48, 48],
    iconAnchor: [24, 24],
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
  const clusters = useMemo(
    () => clusterStations(visibleStations, zoom),
    [visibleStations, zoom],
  );

  return (
    <>
      {clusters.map((cluster) => {
        if (cluster.stations.length > 1) {
          const currentValues = cluster.stations.flatMap((station) =>
            currentStationValue(station) == null
              ? []
              : [currentStationValue(station)!],
          );
          const previousValues = cluster.stations.flatMap((station) => {
            const display = stationMarkerDisplay(station);
            return display.previous && display.value != null
              ? [display.value]
              : [];
          });
          const previous =
            currentValues.length === 0 && previousValues.length > 0;
          const values = currentValues.length ? currentValues : previousValues;
          const average = values.length
            ? values.reduce((total, value) => total + value, 0) / values.length
            : null;
          const classification = classifyPm25(average);
          const label = `${cluster.stations.length} สถานี${previous ? " · สีจากข้อมูลก่อนหน้า ไม่ใช่ค่าปัจจุบัน" : ""} แตะเพื่อขยายแผนที่`;
          return (
            <PriorityMarker
              priorityId={`station-cluster:${cluster.id}`}
              key={cluster.id}
              position={[cluster.lat, cluster.lon]}
              title={label}
              alt={label}
              icon={clusterIcon(
                cluster.stations.length,
                classification.color,
                previous,
              )}
              eventHandlers={{
                click: () =>
                  map.fitBounds(
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
