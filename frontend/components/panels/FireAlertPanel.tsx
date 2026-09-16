"use client";

import type { FirmsLoadStatus } from "@/frontend/hooks/useFirms";
import { T } from "@/frontend/lib/ui";
import type { FirePoint } from "@/frontend/types";

import AppIcon from "@/frontend/components/ui/AppIcon";

export default function FireAlertPanel({
  fires,
  loading,
  status,
  message,
  checkedAt,
  error,
  onShowLayer,
}: {
  fires: FirePoint[];
  loading: boolean;
  status: FirmsLoadStatus;
  message: string | null;
  checkedAt: string | null;
  error: string | null;
  onShowLayer: () => void;
}) {
  // The server owns province, duplicate-pass and 12-hour freshness policy.
  const maxFrp = fires.reduce(
    (maximum, fire) => Math.max(maximum, fire.frp ?? 0),
    0,
  );
  const severity =
    fires.length >= 3 || maxFrp >= 20
      ? "high"
      : fires.length > 0
        ? "watch"
        : "clear";
  const active = severity !== "clear";
  const unavailable = ["failed", "unavailable", "unconfigured"].includes(
    status,
  );
  const stale = status === "stale";
  const tone =
    unavailable || stale || severity === "watch"
      ? "#914600"
      : severity === "high"
        ? T.red
        : T.teal;
  const newest = fires.reduce<string | null>((latest, fire) => {
    if (!fire.acquired_at) return latest;
    return !latest || fire.acquired_at > latest ? fire.acquired_at : latest;
  }, null);
  const detailMessage = error ?? (unavailable || stale ? message : null);

  return (
    <section
      style={{
        border: `1px solid ${active || unavailable || stale ? tone : T.line}`,
        borderRadius: "11px",
        padding: ".7em",
        background: active || unavailable || stale ? `${tone}12` : T.chip,
      }}
      aria-live="polite"
    >
      <div style={{ display: "flex", alignItems: "center", gap: ".5em" }}>
        <span aria-hidden style={{ color: tone, display: "inline-flex" }}>
          {loading ? (
            "…"
          ) : unavailable || stale ? (
            <AppIcon name="alert" size={20} />
          ) : active ? (
            <AppIcon name="satellite" size={20} />
          ) : (
            <AppIcon name="check" size={20} />
          )}
        </span>
        <div style={{ flex: 1 }}>
          <b style={{ fontSize: ".78em" }}>
            {loading
              ? "กำลังตรวจจุดความร้อนจากดาวเทียม…"
              : unavailable
                ? "ยังตรวจสอบจุดความร้อนจากดาวเทียมไม่ได้"
                : stale
                  ? "ข้อมูลล่าสุดเกิน 12 ชั่วโมง"
                  : severity === "high"
                    ? `เฝ้าระวัง: พบ ${fires.length} จุดความร้อนจากดาวเทียมในนครปฐม`
                    : severity === "watch"
                      ? `พบ ${fires.length} จุดความร้อนจากดาวเทียมในนครปฐม`
                      : status === "checked_no_hotspots"
                        ? "ตรวจแล้วไม่พบจุดความร้อนในช่วง 12 ชั่วโมง"
                        : "ยังไม่ได้ตรวจข้อมูลดาวเทียม"}
          </b>
          <div
            style={{ fontSize: ".66em", color: T.subInk, marginTop: ".15em" }}
          >
            NASA FIRMS · จุดความร้อนจากดาวเทียม ไม่ใช่เหตุไฟไหม้ที่ยืนยันแล้ว
            {newest
              ? ` · ล่าสุด ${new Date(newest).toLocaleString("th-TH")}`
              : checkedAt
                ? ` · ตรวจ ${new Date(checkedAt).toLocaleString("th-TH")}`
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
      {detailMessage && (
        <div
          style={{
            fontSize: ".65em",
            color: error || unavailable ? "#8f2f2a" : tone,
            marginTop: ".35em",
          }}
        >
          {detailMessage}
        </div>
      )}
    </section>
  );
}
