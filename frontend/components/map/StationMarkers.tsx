"use client";

import L from "leaflet";
import { Marker, Popup } from "react-leaflet";

import { classifyPm25 } from "@/frontend/lib/aqi";
import { T } from "@/frontend/lib/ui";
import type { Station } from "@/frontend/types";

// ไอคอนสถานี = วงกลมสีตามระดับ AQI + ไอคอนรูปทรง (●◆▲■✦) ข้างใน
// (สี + รูปทรง สื่อระดับพร้อมกัน — รองรับ color-blind) · ขนาดโตขึ้นเมื่อค่าสูง
function stationIcon(color: string, glyph: string, size: number) {
  const fs = Math.round(size * 0.52);
  return L.divIcon({
    className: "cp-marker",
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2.5px solid #fff;box-shadow:0 0 0 1.5px rgba(0,0,0,.32),0 1px 4px rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;color:#fff;font-size:${fs}px;font-weight:800;line-height:1">${glyph}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

export default function StationMarkers({
  stations,
  onSelect,
}: {
  stations: Station[];
  onSelect?: (s: Station) => void;
}) {
  return (
    <>
      {stations.map((s) => {
        const cls = classifyPm25(s.pm25);
        const pm = s.pm25 ?? 0;
        const size = pm > 90 ? 28 : pm > 50 ? 24 : 20;
        return (
          <Marker
            key={s.id}
            position={[s.lat, s.lon]}
            icon={stationIcon(cls.color, cls.glyph, size)}
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
                  <span style={{ fontWeight: 700 }}>{s.name_th ?? s.id}</span>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: ".3em" }}>
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
                  <span style={{ fontSize: ".75em", color: "#5a6664" }}>µg/m³</span>
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
                  <div style={{ fontSize: ".75em", color: "#5a6664", marginTop: ".2em" }}>
                    จ.{s.province}
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}
