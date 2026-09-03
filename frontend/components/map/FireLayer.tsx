"use client";

import L from "leaflet";
import { Marker, Popup } from "react-leaflet";

import type { FirePoint } from "@/frontend/types";

// Flame marker means a satellite signal that may indicate combustion.
function fireIcon(size: number) {
  const touchSize = 44;
  return L.divIcon({
    className: "cp-marker",
    html: `<div style="width:${touchSize}px;height:${touchSize}px;display:flex;align-items:center;justify-content:center"><span style="font-size:${size}px;line-height:1;filter:drop-shadow(0 0 5px rgba(255,87,34,.95))">🔥</span></div>`,
    iconSize: [touchSize, touchSize],
    iconAnchor: [touchSize / 2, touchSize / 2],
    popupAnchor: [0, -touchSize / 2],
  });
}

export default function FireLayer({ fires }: { fires: FirePoint[] }) {
  return (
    <>
      {fires.map((f, i) => {
        const frp = f.frp ?? 0;
        const size = frp > 50 ? 24 : frp > 15 ? 20 : 16;
        return (
          <Marker
            key={`${f.lat}-${f.lon}-${i}`}
            position={[f.lat, f.lon]}
            icon={fireIcon(size)}
            title={`จุดต้องสงสัยการเผาไหม้จากดาวเทียม ${f.frp ?? "ไม่ระบุ"} MW`}
            alt={`จุดต้องสงสัยการเผาไหม้จากดาวเทียม ${f.frp ?? "ไม่ระบุ"} MW`}
          >
            <Popup>
              <div style={{ fontFamily: "inherit" }}>
                <div style={{ fontWeight: 700 }}>🔥 จุดต้องสงสัยการเผาไหม้</div>
                <div style={{ color: "#5a6664", fontSize: ".82em" }}>
                  NASA FIRMS · {f.satellite ?? "ไม่ระบุดาวเทียม"}
                </div>
                {f.frp != null && <div>FRP: {f.frp} MW</div>}
                {f.acq_date && (
                  <div style={{ color: "#5a6664", fontSize: ".85em" }}>
                    {f.acquired_at
                      ? new Date(f.acquired_at).toLocaleString("th-TH")
                      : f.acq_date}
                  </div>
                )}
                {f.confidence && (
                  <div style={{ color: "#5a6664", fontSize: ".8em" }}>
                    ความเชื่อมั่น:{" "}
                    {f.confidence === "h"
                      ? "สูง"
                      : f.confidence === "n"
                        ? "ปานกลาง"
                        : f.confidence === "l"
                          ? "ต่ำ"
                          : f.confidence}
                  </div>
                )}
                <div
                  style={{
                    color: "#8a4b16",
                    fontSize: ".78em",
                    marginTop: ".25em",
                  }}
                >
                  สัญญาณดาวเทียมที่อาจเกิดจากการเผาไหม้
                  ไม่ใช่เหตุไฟไหม้ที่ยืนยันแล้ว
                </div>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}
