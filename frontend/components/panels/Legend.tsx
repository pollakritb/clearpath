"use client";

import { AQI_LEGEND } from "@/frontend/lib/aqi";
import { T } from "@/frontend/lib/ui";

// ป้ายระดับ PM2.5 แบบกระจก ลอยมุมขวาบนของแผนที่
export default function Legend() {
  return (
    <div
      role="group"
      aria-label="ระดับ PM2.5"
      style={{
        background: "rgba(255,255,255,.82)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        border: "1px solid rgba(255,255,255,.7)",
        borderRadius: "13px",
        boxShadow: "0 6px 22px rgba(0,0,0,.16)",
        padding: ".75em .85em",
        minWidth: "13.5em",
        fontFamily: "inherit",
        color: "#1a2826",
      }}
    >
      <div style={{ fontSize: ".78em", fontWeight: 700, marginBottom: ".5em" }}>
        ระดับ PM2.5{" "}
        <span style={{ fontFamily: T.mono, color: "#5a6664", fontWeight: 500 }}>
          (µg/m³)
        </span>
      </div>
      {AQI_LEGEND.map((lg) => (
        <div
          key={lg.range}
          style={{
            display: "flex",
            alignItems: "center",
            gap: ".55em",
            padding: ".18em 0",
            fontSize: ".78em",
          }}
        >
          <span
            aria-hidden
            style={{
              width: "1.25em",
              height: "1.25em",
              flex: "none",
              borderRadius: "5px",
              background: lg.color,
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: ".72em",
            }}
          >
            {lg.glyph}
          </span>
          <span style={{ flex: 1, fontWeight: 600 }}>{lg.level}</span>
          <span style={{ fontFamily: T.mono, color: "#5a6664" }}>{lg.range}</span>
        </div>
      ))}
    </div>
  );
}
