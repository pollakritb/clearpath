"use client";

import { classifyPm25 } from "@/frontend/lib/aqi";
import { T } from "@/frontend/lib/ui";
import type { ForecastResponse, Station } from "@/frontend/types";

export default function ForecastPanel({
  station,
  data,
  loading,
  error,
}: {
  station: Station | null;
  data: ForecastResponse | null;
  loading: boolean;
  error: string | null;
}) {
  const values = data?.points.map((p) => p.pm25) ?? [];
  const max = Math.max(...values, 1);
  const path = values
    .map((value, index) => {
      const x = values.length <= 1 ? 0 : (index / (values.length - 1)) * 100;
      const y = 44 - (value / max) * 38;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const latest = data?.points.at(-1);
  const cls = classifyPm25(latest?.pm25);

  return (
    <section style={{ borderTop: `1px solid ${T.line}`, paddingTop: "1em" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: ".5em",
        }}
      >
        <h2 style={{ margin: 0, fontSize: ".95em" }}>พยากรณ์ PM2.5</h2>
        <span style={{ fontFamily: T.mono, fontSize: ".7em", color: T.subInk }}>
          12 ชั่วโมง
        </span>
      </div>
      {!station && (
        <p style={{ fontSize: ".78em", color: T.subInk }}>
          เลือกสถานีบนแผนที่เพื่อดูพยากรณ์
        </p>
      )}
      {loading && (
        <p style={{ fontSize: ".78em", color: T.subInk }}>กำลังคำนวณแนวโน้ม…</p>
      )}
      {error && (
        <p role="alert" style={{ fontSize: ".76em", color: "#c2433a" }}>
          {error}
        </p>
      )}
      {data && latest && (
        <div className="cp-anim-rise" style={{ marginTop: ".65em" }}>
          <div
            style={{ display: "flex", alignItems: "baseline", gap: ".35em" }}
          >
            <b
              style={{
                fontFamily: T.mono,
                fontSize: "1.8em",
                color: cls.color,
              }}
            >
              {latest.pm25}
            </b>
            <span style={{ fontSize: ".72em", color: T.subInk }}>
              µg/m³ ในอีก {data.horizon_hours} ชม.
            </span>
          </div>
          <svg
            viewBox="0 0 100 48"
            role="img"
            aria-label={`แนวโน้ม PM2.5 ${values.join(", ")}`}
            style={{ width: "100%", height: "82px" }}
          >
            <line x1="0" y1="44" x2="100" y2="44" stroke="var(--cp-line)" />
            <path
              d={path}
              fill="none"
              stroke="var(--cp-teal)"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
          </svg>
          <div style={{ fontSize: ".68em", color: T.subInk }}>
            {data.model_version
              ? `Model ${data.model_version}`
              : "Baseline: damped local trend"}{" "}
            · ช่วงปลาย {latest.lower}–{latest.upper} µg/m³ ·
            ไม่ใช่คำแนะนำทางการแพทย์
          </div>
          {data.fallback_reason && (
            <div
              style={{ fontSize: ".62em", color: T.subInk, marginTop: ".25em" }}
            >
              ML fallback: {data.fallback_reason}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
