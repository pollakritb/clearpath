"use client";

import { T } from "@/frontend/lib/ui";
import type { HistoryPoint } from "@/frontend/types";

const W = 320;
const H = 120;
const MAX = 90; // เพดานสเกล (เกินนี้ = อันตราย)
const DANGER = 50;

function clamp(v: number) {
  return Math.max(0, Math.min(MAX, v));
}

export default function HistoryChart({
  points,
  loading,
}: {
  points: HistoryPoint[];
  loading: boolean;
}) {
  const values = points
    .filter((p) => p.pm25 != null)
    .map((p) => p.pm25 as number);

  const dangerY = (H - (DANGER / MAX) * H).toFixed(1);

  let body: React.ReactNode;
  if (loading) {
    body = (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: ".5em",
          padding: ".4em 0",
        }}
      >
        {[70, 90, 55].map((w, i) => (
          <div
            key={i}
            style={{
              height: "14px",
              width: `${w}%`,
              borderRadius: "6px",
              background: T.chip,
            }}
          />
        ))}
      </div>
    );
  } else if (values.length < 2) {
    body = (
      <p
        style={{
          padding: "1.2em 0",
          textAlign: "center",
          fontSize: ".8em",
          color: T.subInk,
        }}
      >
        ยังไม่มีข้อมูลย้อนหลังพอจะวาดกราฟ
        <br />
        (จะสะสมเมื่อ cron sync ทำงานต่อเนื่อง)
      </p>
    );
  } else {
    const pts = values.map(
      (v, i) =>
        [(i / (values.length - 1)) * W, H - (clamp(v) / MAX) * H] as [
          number,
          number,
        ],
    );
    const line =
      "M " +
      pts.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" L ");
    const area = `${line} L ${W} ${H} L 0 ${H} Z`;
    body = (
      <div
        style={{
          position: "relative",
          background: T.chip,
          borderRadius: "10px",
          padding: ".6em .5em",
        }}
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: "100%", height: "auto", display: "block" }}
          role="img"
          aria-label="กราฟ PM2.5 ย้อนหลัง 24 ชั่วโมง"
        >
          <line
            x1="0"
            y1={dangerY}
            x2={W}
            y2={dangerY}
            stroke="#e0554b"
            strokeWidth="1.5"
            strokeDasharray="4 4"
            opacity="0.7"
          />
          <path d={area} fill="rgba(14,124,121,.14)" />
          <path
            d={line}
            fill="none"
            stroke="#0e7c79"
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: ".66em",
            color: T.subInk,
            fontFamily: T.mono,
            marginTop: ".2em",
          }}
        >
          <span>-24ชม.</span>
          <span style={{ color: "#c2433a" }}>— เส้นอันตราย {DANGER}</span>
          <span>ตอนนี้</span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginTop: ".8em" }} className="cp-anim-rise">
      <div
        style={{
          fontSize: ".78em",
          fontWeight: 600,
          marginBottom: ".4em",
          color: T.subInk,
        }}
      >
        PM2.5 ย้อนหลัง 24 ชม.
      </div>
      {body}
    </div>
  );
}
