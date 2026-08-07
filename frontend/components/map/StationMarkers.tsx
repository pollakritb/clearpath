"use client";

import L from "leaflet";
import { useMemo, useState } from "react";
import { Marker, Popup, useMapEvents } from "react-leaflet";

import { classifyPm25 } from "@/frontend/lib/aqi";
import { clusterStations } from "@/frontend/lib/station-clusters";
import { T } from "@/frontend/lib/ui";
import type { Station } from "@/frontend/types";

// ไอคอนสถานี = วงกลมสีตามระดับ AQI + ไอคอนรูปทรง (●◆▲■✦) ข้างใน
// (สี + รูปทรง สื่อระดับพร้อมกัน — รองรับ color-blind) · ขนาดโตขึ้นเมื่อค่าสูง
function stationIcon(color: string, glyph: string, size: number) {
  const fs = Math.round(size * 0.52);
  const touchSize = 44;
  return L.divIcon({
    className: "cp-marker",
    html: `<div style="width:${touchSize}px;height:${touchSize}px;display:flex;align-items:center;justify-content:center"><div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2.5px solid #fff;box-shadow:0 0 0 1.5px rgba(0,0,0,.32),0 1px 4px rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;color:#fff;font-size:${fs}px;font-weight:800;line-height:1">${glyph}</div></div>`,
    iconSize: [touchSize, touchSize],
    iconAnchor: [touchSize / 2, touchSize / 2],
    popupAnchor: [0, -touchSize / 2],
  });
}

function clusterIcon(count: number, color: string) {
  return L.divIcon({
    className: "cp-marker cp-marker--cluster",
    html: `<div style="width:44px;height:44px;display:flex;align-items:center;justify-content:center"><div style="min-width:34px;height:34px;padding:0 8px;border-radius:18px;background:${color};border:3px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;color:#fff;font:800 13px system-ui">${count}</div></div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
}

export default function StationMarkers({
  stations,
  onSelect,
}: {
  stations: Station[];
  onSelect?: (s: Station) => void;
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
          const values = cluster.stations.flatMap((station) =>
            station.pm25 == null ? [] : [station.pm25],
          );
          const average = values.length
            ? values.reduce((total, value) => total + value, 0) / values.length
            : null;
          const classification = classifyPm25(average);
          const label = `${cluster.stations.length} สถานี แตะเพื่อขยายแผนที่`;
          return (
            <Marker
              key={cluster.id}
              position={[cluster.lat, cluster.lon]}
              title={label}
              alt={label}
              icon={clusterIcon(cluster.stations.length, classification.color)}
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
        const cls = classifyPm25(s.pm25);
        const pm = s.pm25 ?? 0;
        const size = pm > 90 ? 28 : pm > 50 ? 24 : 20;
        const stationName = s.name_th ?? s.name_en ?? s.id;
        const markerLabel = `${stationName} PM2.5 ${s.pm25 ?? "ไม่มีข้อมูล"} ไมโครกรัมต่อลูกบาศก์เมตร ${
          s.data_status === "expired" ? "ข้อมูลหมดอายุ" : cls.level
        }`;
        return (
          <Marker
            key={s.id}
            position={[s.lat, s.lon]}
            title={markerLabel}
            alt={markerLabel}
            icon={stationIcon(
              s.data_status === "expired" ? "#7b8583" : cls.color,
              s.data_status === "expired" ? "×" : cls.glyph,
              size,
            )}
            eventHandlers={{ click: () => onSelect?.(s) }}
          >
            <Popup>
              <div style={{ fontFamily: "inherit", minWidth: "8.5em" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: ".4em",
                    marginBottom: ".25em",
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: "1.1em",
                      height: "1.1em",
                      borderRadius: "50%",
                      background: cls.color,
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: ".7em",
                      flex: "none",
                    }}
                  >
                    {cls.glyph}
                  </span>
                  <span style={{ fontWeight: 700 }}>{stationName}</span>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: ".3em",
                  }}
                >
                  <span
                    style={{
                      fontFamily: T.mono,
                      fontWeight: 600,
                      fontSize: "1.5em",
                      lineHeight: 1,
                      color: cls.color,
                    }}
                  >
                    {s.pm25 ?? "—"}
                  </span>
                  <span style={{ fontSize: ".75em", color: "#5a6664" }}>
                    µg/m³
                  </span>
                  <span
                    style={{
                      marginLeft: "auto",
                      fontSize: ".75em",
                      fontWeight: 700,
                      color: cls.color,
                    }}
                  >
                    {cls.glyph} {cls.level}
                  </span>
                </div>
                {s.province && (
                  <div
                    style={{
                      fontSize: ".75em",
                      color: "#5a6664",
                      marginTop: ".2em",
                    }}
                  >
                    จ.{s.province}
                  </div>
                )}
                <div
                  style={{
                    fontSize: ".72em",
                    color:
                      s.data_status === "fresh"
                        ? T.teal
                        : s.data_status === "delayed"
                          ? "#b36b00"
                          : "#b53d35",
                    marginTop: ".2em",
                  }}
                >
                  {s.data_status === "fresh"
                    ? "ข้อมูลสด"
                    : s.data_status === "delayed"
                      ? "ข้อมูลล่าช้า"
                      : "ข้อมูลหมดอายุ ไม่ใช้คำนวณพื้นผิว"}
                  {s.age_minutes != null
                    ? ` · ${Math.round(s.age_minutes)} นาที`
                    : ""}
                </div>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}
