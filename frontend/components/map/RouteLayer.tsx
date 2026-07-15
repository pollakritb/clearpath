"use client";

import { Fragment } from "react";
import { Polyline, Tooltip } from "react-leaflet";

import { classifyPm25 } from "@/frontend/lib/aqi";
import { ROUTE_ALT, ROUTE_RECOMMENDED } from "@/frontend/lib/ui";
import type { RouteResult } from "@/frontend/types";

// เส้นทางแบบ Google-Maps: ปลอกขาว (casing) + แกนสี
// เส้นที่ "เลือก/ชี้" = teal หนา + dash วิ่ง (อยู่บนสุด) · เส้นอื่น = เทาจาง
export default function RouteLayer({
  routes,
  recommendedId,
  selectedId,
  hoveredId,
}: {
  routes: RouteResult[];
  recommendedId: string;
  selectedId?: string | null;
  hoveredId?: string | null;
}) {
  const isEmph = (id: string) => id === selectedId || id === hoveredId;

  // วาดเส้นที่เน้นทีหลังสุด (อยู่บนสุด)
  const ordered = [...routes].sort(
    (a, b) => (isEmph(a.id) ? 1 : 0) - (isEmph(b.id) ? 1 : 0),
  );

  return (
    <>
      {ordered.map((r) => {
        const emph = isEmph(r.id);
        const core = emph ? ROUTE_RECOMMENDED : ROUTE_ALT;
        const avg = classifyPm25(r.avg_pm25);
        return (
          <Fragment key={r.id}>
            {/* white casing */}
            <Polyline
              positions={r.geometry}
              pathOptions={{
                color: "#ffffff",
                weight: emph ? 9 : 6,
                opacity: emph ? 1 : 0.7,
                lineCap: "round",
                lineJoin: "round",
              }}
            />
            {/* colored core */}
            <Polyline
              positions={r.geometry}
              pathOptions={{
                color: core,
                weight: emph ? 4.5 : 3,
                opacity: emph ? 1 : 0.55,
                lineCap: "round",
                lineJoin: "round",
                dashArray: emph ? "6 8" : undefined,
                className: emph ? "cp-route-rec" : undefined,
              }}
            >
              <Tooltip sticky direction="top">
                {r.label} · PM2.5 เฉลี่ย {r.avg_pm25} ({avg.level})
                {r.id === recommendedId ? " · ★ แนะนำ" : ""}
              </Tooltip>
            </Polyline>
          </Fragment>
        );
      })}
    </>
  );
}
