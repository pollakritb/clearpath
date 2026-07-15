"use client";

import { T } from "@/frontend/lib/ui";

interface HeaderProps {
  stationCount: number;
  updatedAt: string | null;
  loading: boolean;
  error: string | null;
  bigText: boolean;
  contrast: boolean;
  onToggleBigText: () => void;
  onToggleContrast: () => void;
}

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
}

export default function Header({
  stationCount,
  updatedAt,
  loading,
  error,
  bigText,
  contrast,
  onToggleBigText,
  onToggleContrast,
}: HeaderProps) {
  const chip: React.CSSProperties = {
    flex: 1,
    display: "flex",
    alignItems: "center",
    gap: ".4em",
    fontSize: ".78em",
    background: T.chip,
    border: `1px solid ${T.line}`,
    borderRadius: "8px",
    padding: ".4em .6em",
  };
  const sqBtn: React.CSSProperties = {
    width: "2.3em",
    height: "2.3em",
    flex: "none",
    border: `1px solid ${T.line}`,
    borderRadius: "9px",
    cursor: "pointer",
    fontFamily: "inherit",
  };

  return (
    <header
      style={{
        padding: "1.15em 1.25em 1em",
        borderBottom: `1px solid ${T.line}`,
        background: T.panel,
        position: "sticky",
        top: 0,
        zIndex: 5,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: ".6em" }}>
        <div
          aria-hidden
          style={{
            width: "2.3em",
            height: "2.3em",
            flex: "none",
            borderRadius: "10px",
            background: T.brandGrad,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 2px 8px rgba(14,124,121,.35)",
          }}
        >
          <div
            style={{
              width: ".95em",
              height: ".95em",
              border: "2.5px solid #fff",
              borderRadius: "50%",
              borderTopColor: "transparent",
              transform: "rotate(-45deg)",
            }}
          />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: ".45em" }}>
            <span style={{ fontWeight: 800, fontSize: "1.3em", letterSpacing: "-.01em" }}>
              ClearPath
            </span>
            <span
              style={{
                fontSize: ".72em",
                fontWeight: 600,
                color: T.teal,
                background: "rgba(14,124,121,.1)",
                padding: ".1em .5em",
                borderRadius: "5px",
              }}
            >
              เบต้า
            </span>
          </div>
          <div style={{ fontSize: ".78em", color: T.subInk, marginTop: ".05em" }}>
            วางแผนเส้นทางเลี่ยงฝุ่น PM2.5
          </div>
        </div>

        <button
          type="button"
          onClick={onToggleBigText}
          aria-label="สลับขนาดตัวอักษรใหญ่"
          aria-pressed={bigText}
          className="cp-focus"
          style={{
            ...sqBtn,
            background: bigText ? T.teal : T.panel,
            color: bigText ? "#fff" : T.ink,
            fontWeight: 700,
            fontSize: ".95em",
          }}
        >
          ก
        </button>
        <button
          type="button"
          onClick={onToggleContrast}
          aria-label="สลับโหมดคอนทราสต์สูง"
          aria-pressed={contrast}
          className="cp-focus"
          style={{
            ...sqBtn,
            background: contrast ? T.ink : T.panel,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span
            aria-hidden
            style={{
              width: "1.05em",
              height: "1.05em",
              borderRadius: "50%",
              background: `linear-gradient(90deg, ${contrast ? "#fff" : T.ink} 50%, transparent 50%)`,
              border: `1.5px solid ${contrast ? "#fff" : T.ink}`,
              display: "block",
            }}
          />
        </button>
      </div>

      <div style={{ display: "flex", gap: ".5em", marginTop: ".85em" }}>
        <div style={chip}>
          <span
            className="cp-anim-pulse"
            aria-hidden
            style={{
              width: ".5em",
              height: ".5em",
              borderRadius: "50%",
              background: T.green,
              boxShadow: "0 0 0 3px rgba(43,191,115,.18)",
            }}
          />
          {error ? (
            <span style={{ color: "#c2433a" }}>เชื่อมต่อสถานีไม่ได้</span>
          ) : (
            <>
              <span style={{ fontFamily: T.mono, fontWeight: 600 }}>
                {loading ? "…" : stationCount}
              </span>
              <span style={{ color: T.subInk }}>สถานี</span>
            </>
          )}
        </div>
        <div style={chip}>
          <span style={{ color: T.subInk }}>อัปเดต</span>
          <span style={{ fontFamily: T.mono, fontWeight: 600 }}>{fmtTime(updatedAt)}</span>
        </div>
      </div>
    </header>
  );
}
