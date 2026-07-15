"use client";

import { useState } from "react";

import { classifyPm25 } from "@/frontend/lib/aqi";
import { T } from "@/frontend/lib/ui";
import type { RouteCompareResponse, Station } from "@/frontend/types";

type Sort = "low" | "high";

// มุมมองรายการ (ไม่ใช้แผนที่) สำหรับผู้ใช้ screen reader / ผู้พิการทางสายตา
export default function ListView({
  stations,
  routeData,
  onSelectStation,
}: {
  stations: Station[];
  routeData: RouteCompareResponse | null;
  onSelectStation: (s: Station) => void;
}) {
  const [sort, setSort] = useState<Sort>("low");

  const sorted = [...stations]
    .filter((s) => s.pm25 != null)
    .sort((a, b) =>
      sort === "low"
        ? (a.pm25 as number) - (b.pm25 as number)
        : (b.pm25 as number) - (a.pm25 as number),
    );

  const best = routeData?.routes.find((r) => r.id === routeData.recommended_id);

  const sortBtn = (key: Sort, label: string) => (
    <button
      type="button"
      onClick={() => setSort(key)}
      className="cp-focus"
      aria-pressed={sort === key}
      style={{
        border: "none",
        cursor: "pointer",
        fontFamily: "inherit",
        fontSize: ".85em",
        fontWeight: 600,
        padding: ".5em .9em",
        borderRadius: "8px",
        minHeight: "44px",
        background: sort === key ? T.teal : "transparent",
        color: sort === key ? "#fff" : T.subInk,
      }}
    >
      {label}
    </button>
  );

  return (
    <div
      className="cp-scroll"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 1100,
        background: T.appBg,
        overflowY: "auto",
        padding: "5em 1.5em 2em",
      }}
    >
      <div style={{ maxWidth: "760px", margin: "0 auto" }}>
        <h2 style={{ margin: "0 0 .15em", fontSize: "1.5em", fontWeight: 800, color: T.ink }}>
          รายการสถานีวัดฝุ่น
        </h2>
        <p style={{ margin: "0 0 1.1em", fontSize: ".92em", color: T.subInk }}>
          มุมมองสำหรับผู้ใช้ screen reader และผู้พิการทางสายตา — ไล่อ่านเป็นลำดับด้วยปุ่ม Tab
        </p>

        <div style={{ display: "flex", alignItems: "center", gap: ".6em", marginBottom: "1.1em" }}>
          <span style={{ fontSize: ".85em", fontWeight: 600, color: T.subInk }}>เรียงตาม</span>
          <div
            style={{
              display: "flex",
              background: T.chip,
              border: `1px solid ${T.line}`,
              borderRadius: "10px",
              padding: ".18em",
            }}
          >
            {sortBtn("low", "ฝุ่นน้อยสุด")}
            {sortBtn("high", "ฝุ่นมากสุด")}
          </div>
        </div>

        {best && (
          <div
            role="region"
            aria-label="สรุปเส้นทางแนะนำ"
            style={{
              background: "rgba(43,191,115,.1)",
              border: "1px solid rgba(43,191,115,.4)",
              borderRadius: "13px",
              padding: "1em 1.1em",
              marginBottom: "1.2em",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: ".5em",
                fontWeight: 800,
                marginBottom: ".3em",
                color: T.ink,
              }}
            >
              <span
                aria-hidden
                style={{
                  width: "1.7em",
                  height: "1.7em",
                  borderRadius: "8px",
                  background: T.green,
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                ✓
              </span>
              เส้นทางแนะนำ: {best.label}
            </div>
            <div style={{ fontSize: ".92em", color: T.ink }}>{routeData?.reason}</div>
          </div>
        )}

        <ul
          role="list"
          style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: ".6em" }}
        >
          {sorted.map((s) => {
            const cls = classifyPm25(s.pm25);
            const name = s.name_th ?? s.name_en ?? s.id;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => onSelectStation(s)}
                  aria-label={`สถานี${name}${s.province ? ` จังหวัด${s.province}` : ""} PM2.5 ${s.pm25} ระดับ${cls.level}`}
                  className="cp-focus"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "1em",
                    width: "100%",
                    textAlign: "left",
                    border: `2px solid ${T.line}`,
                    background: T.panel,
                    borderRadius: "13px",
                    padding: ".85em 1em",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    color: T.ink,
                    minHeight: "64px",
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: "2.6em",
                      height: "2.6em",
                      flex: "none",
                      borderRadius: "11px",
                      background: cls.color,
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "1.2em",
                    }}
                  >
                    {cls.glyph}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontWeight: 700, fontSize: "1.02em" }}>{name}</span>
                    <span style={{ display: "block", fontSize: ".82em", color: T.subInk }}>
                      {s.province ? `จ.${s.province} · ` : ""}
                      {cls.level}
                    </span>
                  </span>
                  <span style={{ textAlign: "right" }}>
                    <span
                      style={{
                        display: "block",
                        fontFamily: T.mono,
                        fontWeight: 600,
                        fontSize: "1.7em",
                        lineHeight: 1,
                        color: cls.color,
                      }}
                    >
                      {s.pm25}
                    </span>
                    <span style={{ display: "block", fontSize: ".68em", color: T.subInk }}>µg/m³</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
