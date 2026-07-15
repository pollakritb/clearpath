"use client";

import { useState } from "react";

import RouteProfile from "@/frontend/components/panels/RouteProfile";
import { useSpeech } from "@/frontend/hooks/useSpeech";
import { classifyPm25 } from "@/frontend/lib/aqi";
import { ROUTE_ALT, ROUTE_RECOMMENDED, T } from "@/frontend/lib/ui";
import type { RouteCompareResponse, RouteResult } from "@/frontend/types";

const RATES = [0.85, 1, 1.25] as const;

function exposureLabel(avg: number): string {
  const k = classifyPm25(avg).levelKey;
  if (k === "good" || k === "moderate") return "ต่ำ";
  if (k === "sensitive") return "ปานกลาง";
  return "สูง";
}

function confColor(label: string | null): string {
  if (label === "สูง") return "#27ae60";
  if (label === "ปานกลาง") return "#e67e22";
  return "#c2433a";
}

function summaryText(data: RouteCompareResponse): string {
  const best = data.routes.find((r) => r.id === data.recommended_id) ?? data.routes[0];
  if (!best) return "ไม่พบเส้นทางที่แนะนำ";
  const cls = classifyPm25(best.avg_pm25);
  return (
    `เส้นทางที่แนะนำคือ ${best.label} ` +
    `รับฝุ่น พีเอ็ม 2.5 เฉลี่ย ${best.avg_pm25} ไมโครกรัมต่อลูกบาศก์เมตร ระดับ${cls.level} ` +
    `ระยะทาง ${best.distance_km} กิโลเมตร ใช้เวลาประมาณ ${Math.round(best.duration_min)} นาที. ` +
    data.reason
  );
}

function RouteCard({
  route,
  recommended,
  selected,
  onSelect,
  onHover,
  onLeave,
}: {
  route: RouteResult;
  recommended: boolean;
  selected: boolean;
  onSelect: () => void;
  onHover?: () => void;
  onLeave?: () => void;
}) {
  const [hover, setHover] = useState(false);
  const avg = classifyPm25(route.avg_pm25);
  const max = classifyPm25(route.max_pm25);
  const border = selected || hover ? T.teal : recommended ? "rgba(43,191,115,.5)" : T.line;

  return (
    <button
      type="button"
      onClick={onSelect}
      onMouseEnter={() => {
        setHover(true);
        onHover?.();
      }}
      onMouseLeave={() => {
        setHover(false);
        onLeave?.();
      }}
      className="cp-focus"
      aria-pressed={selected}
      style={{
        position: "relative",
        border: `2px solid ${border}`,
        background: selected
          ? "rgba(14,124,121,.07)"
          : recommended
            ? "rgba(43,191,115,.05)"
            : T.panel,
        borderRadius: "13px",
        padding: ".85em .9em",
        color: T.ink,
        textAlign: "left",
        width: "100%",
        fontFamily: "inherit",
        cursor: "pointer",
      }}
    >
      {recommended && (
        <span
          style={{
            position: "absolute",
            top: "-.7em",
            left: ".85em",
            background: T.green,
            color: "#fff",
            fontSize: ".68em",
            fontWeight: 700,
            padding: ".2em .6em",
            borderRadius: "6px",
            letterSpacing: ".02em",
          }}
        >
          ★ แนะนำ
        </span>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: ".55em", marginBottom: ".2em" }}>
        <span
          aria-hidden
          style={{
            width: "1.6em",
            height: ".32em",
            borderRadius: "3px",
            background: recommended ? ROUTE_RECOMMENDED : ROUTE_ALT,
            flex: "none",
          }}
        />
        <span style={{ fontWeight: 700, fontSize: ".94em" }}>{route.label}</span>
      </div>

      <div style={{ display: "flex", alignItems: "flex-end", gap: ".9em" }}>
        <div>
          <div style={{ fontSize: ".68em", color: T.subInk, fontWeight: 600 }}>PM2.5 เฉลี่ย</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: ".3em" }}>
            <span
              style={{
                fontFamily: T.mono,
                fontWeight: 600,
                fontSize: "2.2em",
                lineHeight: 1,
                color: avg.color,
              }}
            >
              {route.covered ? route.avg_pm25 : "—"}
            </span>
            <span style={{ fontSize: ".72em", color: T.subInk }}>µg/m³</span>
          </div>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: ".3em",
              marginTop: ".3em",
              fontSize: ".72em",
              fontWeight: 700,
              color: avg.color,
              background: avg.tint,
              padding: ".15em .5em",
              borderRadius: "6px",
            }}
          >
            <span aria-hidden>{avg.glyph}</span>
            <span>{route.covered ? avg.level : "ไม่มีข้อมูล"}</span>
          </div>
        </div>

        <div
          style={{
            flex: 1,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: ".45em .5em",
            fontSize: ".78em",
          }}
        >
          <div>
            <span style={{ color: T.subInk }}>สูงสุด </span>
            <b style={{ fontFamily: T.mono, color: max.color }}>{route.max_pm25}</b>
          </div>
          <div>
            <span style={{ color: T.subInk }}>ระยะ </span>
            <b style={{ fontFamily: T.mono }}>{route.distance_km}</b> กม.
          </div>
          <div>
            <span style={{ color: T.subInk }}>เวลา </span>
            <b style={{ fontFamily: T.mono }}>{Math.round(route.duration_min)}</b> นาที
          </div>
          <div>
            <span style={{ color: T.subInk }}>เปิดรับ </span>
            <b style={{ fontFamily: T.mono }}>{exposureLabel(route.avg_pm25)}</b>
          </div>
        </div>
      </div>

      {/* ความเชื่อมั่นข้อมูล (พื้นที่เซนเซอร์เบาบาง) */}
      <div style={{ marginTop: ".6em", borderTop: `1px solid ${T.line}`, paddingTop: ".55em" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: ".5em",
            fontSize: ".72em",
            marginBottom: ".3em",
          }}
        >
          <span style={{ color: T.subInk }}>ความเชื่อมั่นข้อมูล</span>
          <span style={{ fontWeight: 700, color: confColor(route.confidence_label) }}>
            {route.confidence_label ?? "—"}
          </span>
          {route.avg_nearest_km != null && (
            <span style={{ color: T.subInk, marginLeft: "auto", fontFamily: T.mono }}>
              สถานีใกล้สุด ~{route.avg_nearest_km} กม.
            </span>
          )}
        </div>
        <div style={{ height: "5px", borderRadius: "3px", background: T.line, overflow: "hidden" }}>
          <div
            style={{
              height: "100%",
              width: `${Math.round(route.confidence * 100)}%`,
              background: confColor(route.confidence_label),
              borderRadius: "3px",
              transition: "width .3s",
            }}
          />
        </div>
        {route.confidence_label === "ต่ำ" && (
          <div style={{ fontSize: ".7em", color: "#c2433a", marginTop: ".3em" }}>
            ⚠ เส้นทางนี้อยู่ไกลสถานีวัด — ค่าประมาณอาจคลาดเคลื่อน
          </div>
        )}
      </div>
    </button>
  );
}

export interface RoutePanelProps {
  data: RouteCompareResponse;
  selectedId: string;
  onSelectRoute: (id: string) => void;
  onHoverRoute?: (id: string | null) => void;
}

export default function RoutePanel({
  data,
  selectedId,
  onSelectRoute,
  onHoverRoute,
}: RoutePanelProps) {
  const { supported, speaking, speak, cancel } = useSpeech();
  const [rate, setRate] = useState(1);
  const [gender, setGender] = useState<"f" | "m">("f");

  const play = (r = rate, g = gender) => speak(summaryText(data), { rate: r, gender: g });
  const onAudio = () => (speaking ? cancel() : play());

  const seg: React.CSSProperties = {
    border: "none",
    cursor: "pointer",
    fontWeight: 600,
    borderRadius: "6px",
    minHeight: "32px",
  };

  return (
    <section aria-label="ผลเปรียบเทียบเส้นทาง" className="cp-anim-rise">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: ".6em",
        }}
      >
        <h2 style={{ margin: 0, fontSize: "1em", fontWeight: 700 }}>เส้นทางแนะนำ</h2>
        {supported && (
          <button
            type="button"
            onClick={onAudio}
            className="cp-focus"
            aria-label="อ่านผลออกเสียง"
            style={{
              display: "flex",
              alignItems: "center",
              gap: ".4em",
              border: `1px solid ${T.line}`,
              background: speaking ? "rgba(14,124,121,.12)" : T.panel,
              borderRadius: "9px",
              padding: ".35em .6em",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: ".78em",
              fontWeight: 600,
              color: speaking ? T.teal : T.ink,
              minHeight: "36px",
            }}
          >
            {speaking ? (
              <>
                <span style={{ display: "flex", gap: "2px", alignItems: "center", height: ".9em" }}>
                  {[0, 0.15, 0.3].map((d) => (
                    <span
                      key={d}
                      className="cp-anim-sound"
                      style={{
                        width: "2px",
                        height: "100%",
                        background: "currentColor",
                        animationDelay: `${d}s`,
                      }}
                    />
                  ))}
                </span>
                <span>หยุด</span>
              </>
            ) : (
              <>
                <span aria-hidden style={{ fontSize: "1.05em" }}>
                  🔊
                </span>
                <span>อ่านออกเสียง</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* voice controls while reading */}
      {speaking && (
        <div
          role="group"
          aria-label="ตัวควบคุมเสียง"
          className="cp-anim-rise"
          style={{
            background: "rgba(14,124,121,.07)",
            border: "1px solid rgba(14,124,121,.25)",
            borderRadius: "12px",
            padding: ".7em .8em",
            marginBottom: ".7em",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: ".5em", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => play()}
              className="cp-focus"
              aria-label="เล่นซ้ำ"
              style={{
                display: "flex",
                alignItems: "center",
                gap: ".35em",
                border: `1px solid ${T.line}`,
                background: T.panel,
                borderRadius: "9px",
                padding: ".35em .6em",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: ".76em",
                fontWeight: 600,
                color: T.ink,
                minHeight: "38px",
              }}
            >
              <span aria-hidden>↻</span>เล่นซ้ำ
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: ".3em" }}>
              <span style={{ fontSize: ".72em", color: T.subInk, fontWeight: 600 }}>ความเร็ว</span>
              <div style={{ display: "flex", background: T.chip, border: `1px solid ${T.line}`, borderRadius: "8px", padding: ".12em" }}>
                {RATES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => {
                      setRate(r);
                      play(r);
                    }}
                    className="cp-focus"
                    aria-pressed={rate === r}
                    style={{
                      ...seg,
                      fontFamily: T.mono,
                      fontSize: ".74em",
                      padding: ".3em .5em",
                      background: rate === r ? T.teal : "transparent",
                      color: rate === r ? "#fff" : T.subInk,
                    }}
                  >
                    {r}×
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: ".3em", marginLeft: "auto" }}>
              <span style={{ fontSize: ".72em", color: T.subInk, fontWeight: 600 }}>เสียง</span>
              <div style={{ display: "flex", background: T.chip, border: `1px solid ${T.line}`, borderRadius: "8px", padding: ".12em" }}>
                {(["f", "m"] as const).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => {
                      setGender(g);
                      play(rate, g);
                    }}
                    className="cp-focus"
                    aria-pressed={gender === g}
                    style={{
                      ...seg,
                      fontFamily: "inherit",
                      fontSize: ".74em",
                      padding: ".3em .55em",
                      background: gender === g ? T.teal : "transparent",
                      color: gender === g ? "#fff" : T.subInk,
                    }}
                  >
                    {g === "f" ? "หญิง" : "ชาย"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* reason banner */}
      <div
        style={{
          display: "flex",
          gap: ".6em",
          alignItems: "center",
          background: "rgba(43,191,115,.1)",
          border: "1px solid rgba(43,191,115,.4)",
          borderRadius: "11px",
          padding: ".65em .8em",
          marginBottom: ".7em",
        }}
      >
        <span
          aria-hidden
          style={{
            width: "1.7em",
            height: "1.7em",
            flex: "none",
            borderRadius: "8px",
            background: T.green,
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 800,
          }}
        >
          ✓
        </span>
        <div style={{ fontSize: ".84em", lineHeight: 1.4 }}>{data.reason}</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: ".65em" }}>
        {data.routes.map((r) => (
          <RouteCard
            key={r.id}
            route={r}
            recommended={r.id === data.recommended_id}
            selected={r.id === selectedId}
            onSelect={() => onSelectRoute(r.id)}
            onHover={() => onHoverRoute?.(r.id)}
            onLeave={() => onHoverRoute?.(null)}
          />
        ))}
      </div>

      <RouteProfile data={data} selectedId={selectedId} />
    </section>
  );
}
