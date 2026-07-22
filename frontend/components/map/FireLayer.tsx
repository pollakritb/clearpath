"use client";

import L from "leaflet";
import { Marker, Popup } from "react-leaflet";

import type { FirePoint } from "@/frontend/types";

// ไอคอนจุดความร้อนจากดาวเทียม = 🔥 มีแสงเรืองส้ม · ขนาดตาม FRP
function fireIcon(size: number) {
  return L.divIcon({
    className: "cp-marker",
    html: `<div style="font-size:${size}px;line-height:1;filter:drop-shadow(0 0 5px rgba(255,87,34,.95))">🔥</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
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
          >
            <Popup>
              <div style={{ fontFamily: "inherit" }}>
                <div style={{ fontWeight: 700 }}>
                  🔥 จุดความร้อน (NASA FIRMS)
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
                    Confidence: {f.confidence}
                  </div>
                )}
                <div
                  style={{
                    color: "#8a4b16",
                    fontSize: ".78em",
                    marginTop: ".25em",
                  }}
                >
                  สัญญาณดาวเทียม ไม่ใช่การยืนยันไฟไหม้
                </div>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}
