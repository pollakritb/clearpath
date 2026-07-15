"use client";

import { classifyPm25 } from "@/frontend/lib/aqi";
import { T } from "@/frontend/lib/ui";
import type { RouteCompareResponse, RouteResult } from "@/frontend/types";

const W = 300;
const H = 88;
const DANGER = 50;

function paths(r: RouteResult, yMax: number) {
  const n = r.samples.length;
  if (n < 2) return { line: "", area: "" };
  const pts = r.samples.map(
    (s, i) =>
      [(i / (n - 1)) * W, H - (Math.min(s.pm25, yMax) / yMax) * H] as [number, number],
  );
  const line = "M " + pts.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" L ");
  const area = `${line} L ${W} ${H} L 0 ${H} Z`;
  return { line, area };
}

// กราฟค่าฝุ่น PM2.5 ตลอดเส้นทาง (vs ระยะ) — โชว์ว่าทำไมเส้นที่แนะนำถึงรับฝุ่นน้อยกว่า
// เส้นที่เลือก = เน้น (พื้นสี + เส้นทึบ) · อีกเส้น = เส้นประจางเพื่อเทียบ
export default function RouteProfile({
  data,
  selectedId,
}: {
  data: RouteCompareResponse;
  selectedId: string;
}) {
  const routes = data.routes.filter((r) => r.samples.length >= 2);
  if (routes.length === 0) return null;

  const sel = routes.find((r) => r.id === selectedId) ?? routes[0];
  const other = routes.find((r) => r.id !== sel.id);

  const peak = Math.max(...routes.flatMap((r) => r.samples.map((s) => s.pm25)), 1);
  const yMax = Math.max(peak * 1.12, 20);
  const selCls = classifyPm25(sel.avg_pm25);
  const dangerY = H - (Math.min(DANGER, yMax) / yMax) * H;

  const selP = paths(sel, yMax);
  const otherP = other ? paths(other, yMax) : null;

  // ตำแหน่งจุดฝุ่นสูงสุดของเส้นที่เลือก
  const sIdx = sel.samples.reduce((mi, s, i, arr) => (s.pm25 > arr[mi].pm25 ? i : mi), 0);
  const peakX = (sIdx / (sel.samples.length - 1)) * W;
  const peakY = H - (Math.min(sel.samples[sIdx].pm25, yMax) / yMax) * H;

  return (
    <div style={{ marginTop: ".5em" }} className="cp-anim-rise">
      <div style={{ fontSize: ".78em", fontWeight: 600, marginBottom: ".35em", color: T.subInk }}>
        ค่าฝุ่น PM2.5 ตลอดเส้นทาง ({sel.label})
      </div>
      <div style={{ background: T.chip, borderRadius: "10px", padding: ".55em .5em" }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: "100%", height: "auto", display: "block" }}
          role="img"
          aria-label={`กราฟค่า PM2.5 ตลอดเส้นทาง ${sel.label} เฉลี่ย ${sel.avg_pm25} สูงสุด ${sel.max_pm25}`}
        >
          {/* danger line */}
          {yMax > DANGER && (
            <line
              x1="0"
              y1={dangerY}
              x2={W}
              y2={dangerY}
              stroke="#e0554b"
              strokeWidth="1"
              strokeDasharray="4 4"
              opacity="0.6"
            />
          )}
          {/* other route — faint dashed for comparison */}
          {otherP && (
            <path
              d={otherP.line}
              fill="none"
              stroke={T.subInk as string}
              strokeWidth="1.4"
              strokeDasharray="4 4"
              opacity="0.5"
            />
          )}
          {/* selected route — filled + line */}
          <path d={selP.area} fill={selCls.tint} />
          <path
            d={selP.line}
            fill="none"
            stroke={selCls.color}
            strokeWidth="2.2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {/* peak marker */}
          <circle cx={peakX} cy={peakY} r="3" fill={classifyPm25(sel.max_pm25).color} stroke="#fff" strokeWidth="1.5" />
        </svg>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: ".64em",
            color: T.subInk,
            fontFamily: T.mono,
            marginTop: ".2em",
          }}
        >
          <span>ต้นทาง</span>
          <span style={{ color: classifyPm25(sel.max_pm25).color }}>● สูงสุด {sel.max_pm25}</span>
          <span>ปลายทาง</span>
        </div>
      </div>
      {other && (
        <div style={{ fontSize: ".68em", color: T.subInk, marginTop: ".35em", display: "flex", gap: ".8em" }}>
          <span>
            <span style={{ color: selCls.color, fontWeight: 700 }}>━</span> {sel.label} (เฉลี่ย {sel.avg_pm25})
          </span>
          <span>
            <span style={{ color: T.subInk }}>┄</span> {other.label} (เฉลี่ย {other.avg_pm25})
          </span>
        </div>
      )}
    </div>
  );
}
