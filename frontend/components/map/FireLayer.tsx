"use client";

import L from "leaflet";
import { Marker, Popup } from "react-leaflet";

import type { FirePoint } from "@/frontend/types";

// A satellite glyph avoids presenting a thermal anomaly as a confirmed fire.
function hotspotIcon(size: number) {
  const touchSize = 44;
  return L.divIcon({
    className: "cp-marker",
    html: `<div style="width:${touchSize}px;height:${touchSize}px;display:flex;align-items:center;justify-content:center"><span style="width:${size + 10}px;height:${size + 10}px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#fff7ed;border:2px solid #ea580c;color:#c2410c;filter:drop-shadow(0 2px 4px rgba(124,45,18,.35))"><svg aria-hidden="true" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m9 9 6 6M15 9l-6 6"/><rect x="9" y="9" width="6" height="6" rx="1"/><path d="m7.5 7.5-3-3M16.5 16.5l3 3M4 8l4-4M16 20l4-4"/><path d="M16.5 7.5a4 4 0 0 1 0-5.5M19 10a7.5 7.5 0 0 1 0-10"/></svg></span></div>`,
    iconSize: [touchSize, touchSize],
    iconAnchor: [touchSize / 2, touchSize / 2],
    popupAnchor: [0, -touchSize / 2],
  });
}

export default function FireLayer({ fires }: { fires: FirePoint[] }) {
  return (
    <>
      {fires.map((f) => {
        const frp = f.frp ?? 0;
        const size = frp > 50 ? 24 : frp > 15 ? 20 : 16;
        return (
          <Marker
            key={f.id}
            position={[f.lat, f.lon]}
            icon={hotspotIcon(size)}
            title={`จุดความร้อนจากดาวเทียม ${f.frp ?? "ไม่ระบุ"} MW`}
            alt={`จุดความร้อนจากดาวเทียม ${f.frp ?? "ไม่ระบุ"} MW`}
          >
            <Popup>
              <div style={{ fontFamily: "inherit" }}>
                <div style={{ fontWeight: 700 }}>จุดความร้อนจากดาวเทียม</div>
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
                {f.source_products.length > 1 && (
                  <div style={{ color: "#5a6664", fontSize: ".8em" }}>
                    รวมจุดซ้ำจาก {f.source_products.length} ชุดข้อมูลดาวเทียม
                  </div>
                )}
                <div
                  style={{
                    color: "#8a4b16",
                    fontSize: ".78em",
                    marginTop: ".25em",
                  }}
                >
                  จุดความร้อนจากดาวเทียมอาจมีได้หลายสาเหตุ
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
