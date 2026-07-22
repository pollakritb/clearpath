"use client";

import { T } from "@/frontend/lib/ui";
import type { FirePoint } from "@/frontend/types";
import { useEffect, useState } from "react";

const MAX_ALERT_AGE_MS = 12 * 60 * 60 * 1000;

function isFresh(fire: FirePoint, now: number) {
  if (!fire.acquired_at) return false;
  const acquired = Date.parse(fire.acquired_at);
  return (
    Number.isFinite(acquired) &&
    now - acquired >= 0 &&
    now - acquired <= MAX_ALERT_AGE_MS
  );
}

export default function FireAlertPanel({
  fires,
  loading,
  error,
  onShowLayer,
}: {
  fires: FirePoint[];
  loading: boolean;
  error: string | null;
  onShowLayer: () => void;
}) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const update = () => setNow(Date.now());
    update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, []);
  // The backend already applies the province polygon; the browser only owns
  // the time window used for the current warning state.
  const nearby = fires.filter((fire) => isFresh(fire, now));
  const maxFrp = nearby.reduce(
    (maximum, fire) => Math.max(maximum, fire.frp ?? 0),
    0,
  );
  const severity =
    nearby.length >= 3 || maxFrp >= 20
      ? "high"
      : nearby.length > 0
        ? "watch"
        : "clear";
  const active = severity !== "clear";
  const tone =
    severity === "high" ? T.red : severity === "watch" ? "#d97706" : T.teal;
  const newest = nearby.reduce<string | null>((latest, fire) => {
    if (!fire.acquired_at) return latest;
    return !latest || fire.acquired_at > latest ? fire.acquired_at : latest;
  }, null);

  return (
    <section
      style={{
        border: `1px solid ${active ? tone : T.line}`,
        borderRadius: "11px",
        padding: ".7em",
        background: active ? `${tone}12` : T.chip,
      }}
      aria-live="polite"
    >
      <div style={{ display: "flex", alignItems: "center", gap: ".5em" }}>
        <span aria-hidden style={{ color: tone, fontSize: "1.2em" }}>
          {active ? "▲" : "✓"}
        </span>
        <div style={{ flex: 1 }}>
          <b style={{ fontSize: ".78em" }}>
            {loading
              ? "กำลังตรวจ NASA FIRMS…"
              : severity === "high"
                ? `เฝ้าระวังสูง: ${nearby.length} จุดความร้อนสดในนครปฐม`
                : severity === "watch"
                  ? `เฝ้าระวัง: พบ ${nearby.length} จุดความร้อนสดในนครปฐม`
                  : "ไม่พบจุดความร้อนอายุไม่เกิน 12 ชั่วโมงในพื้นที่"}
          </b>
          <div
            style={{ fontSize: ".66em", color: T.subInk, marginTop: ".15em" }}
          >
            จุดความร้อนจากดาวเทียมไม่ใช่การยืนยันไฟไหม้
            {newest
              ? ` · ล่าสุด ${new Date(newest).toLocaleString("th-TH")}`
              : ""}
          </div>
        </div>
        {active && (
          <button
            type="button"
            onClick={onShowLayer}
            className="cp-focus"
            style={{
              border: "none",
              borderRadius: "8px",
              background: tone,
              color: "#fff",
              padding: ".5em .65em",
              fontFamily: "inherit",
              fontSize: ".68em",
              fontWeight: 700,
            }}
          >
            ดูบนแผนที่
          </button>
        )}
      </div>
      {error && (
        <div
          style={{ fontSize: ".65em", color: "#b53d35", marginTop: ".35em" }}
        >
          ยังตรวจสอบไม่ได้: {error}
        </div>
      )}
    </section>
  );
}
