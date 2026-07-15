"use client";

import { useEffect, useState } from "react";

import { api } from "@/frontend/lib/api-client";
import { T } from "@/frontend/lib/ui";
import type { Coordinate, GeocodeResult } from "@/frontend/types";

export interface SearchBoxProps {
  startText: string;
  endText: string;
  activeField: "start" | "end";
  onActiveFieldChange: (f: "start" | "end") => void;
  onSelectPlace: (c: Coordinate) => void; // เลือกจาก autocomplete → ลงช่องที่ active อยู่
  method: "idw" | "kriging";
  onMethodChange: (m: "idw" | "kriging") => void;
  onSwap: () => void;
  onCompare: () => void;
  comparing: boolean;
  canCompare: boolean;
}

export default function SearchBox(props: SearchBoxProps) {
  const {
    startText,
    endText,
    activeField,
    onActiveFieldChange,
    onSelectPlace,
    method,
    onMethodChange,
    onSwap,
    onCompare,
    comparing,
    canCompare,
  } = props;

  const [q, setQ] = useState("");
  const [focused, setFocused] = useState(false);
  const [sugs, setSugs] = useState<GeocodeResult[]>([]);
  const [searching, setSearching] = useState(false);

  // ค้นหาแบบ debounce — setState ทั้งหมดอยู่ใน callback (ไม่ sync ใน effect)
  useEffect(() => {
    const query = q.trim();
    let cancelled = false;
    const t = setTimeout(async () => {
      if (query.length < 2) {
        if (!cancelled) setSugs([]);
        return;
      }
      try {
        if (!cancelled) setSearching(true);
        const res = await api.geocode(query);
        if (!cancelled) setSugs(res.results);
      } catch {
        if (!cancelled) setSugs([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 320);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  const open = focused && q.trim().length >= 2;
  const pinLabel = activeField === "start" ? "ต้นทาง" : "ปลายทาง";

  function pick(r: GeocodeResult) {
    onSelectPlace({ lat: r.lat, lon: r.lon, label: r.label });
    setQ("");
    setSugs([]);
    setFocused(false);
  }

  const fieldRow = (
    field: "start" | "end",
    badge: string,
    badgeBg: string,
    label: string,
    value: string,
    placeholder: string,
  ) => {
    const active = activeField === field;
    return (
      <button
        type="button"
        onClick={() => onActiveFieldChange(field)}
        className="cp-focus"
        style={{
          display: "flex",
          alignItems: "center",
          gap: ".65em",
          background: T.input,
          border: `2px solid ${active ? badgeBg : T.line}`,
          borderRadius: "11px",
          padding: ".55em .7em",
          cursor: "pointer",
          minHeight: "44px",
          textAlign: "left",
          fontFamily: "inherit",
          color: T.ink,
          width: "100%",
        }}
      >
        <span
          style={{
            width: "1.5em",
            height: "1.5em",
            flex: "none",
            borderRadius: "50%",
            background: badgeBg,
            color: "#fff",
            fontWeight: 800,
            fontSize: ".85em",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: `0 0 0 3px ${badgeBg}38`,
            zIndex: 1,
          }}
        >
          {badge}
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span
            style={{
              display: "block",
              fontSize: ".7em",
              fontWeight: 600,
              color: T.subInk,
              letterSpacing: ".02em",
            }}
          >
            {label}
          </span>
          <span
            style={{
              display: "block",
              fontFamily: T.mono,
              fontSize: ".92em",
              fontWeight: 500,
              color: value ? T.ink : T.subInk,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {value || placeholder}
          </span>
        </span>
      </button>
    );
  };

  return (
    <section aria-label="วางแผนเส้นทาง">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: ".7em",
        }}
      >
        <h2 style={{ margin: 0, fontSize: "1em", fontWeight: 700 }}>วางแผนเส้นทาง</h2>
        <span style={{ fontSize: ".74em", color: T.subInk }}>
          ปักหมุด:{" "}
          <b style={{ color: activeField === "start" ? T.green : T.red }}>{pinLabel}</b>
        </span>
      </div>

      {/* autocomplete */}
      <div style={{ position: "relative", marginBottom: ".55em" }}>
        <div
          role="combobox"
          aria-expanded={open}
          aria-controls="cp-ac-list"
          aria-haspopup="listbox"
          aria-label="ค้นหาสถานที่"
          className="cp-focus"
          style={{
            display: "flex",
            alignItems: "center",
            gap: ".55em",
            background: T.input,
            border: `2px solid ${open ? T.teal : T.line}`,
            borderRadius: "11px",
            padding: ".55em .7em",
            minHeight: "44px",
          }}
        >
          <span aria-hidden style={{ opacity: 0.6 }}>
            🔍
          </span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            placeholder={`พิมพ์ชื่อสถานที่ (จะลงช่อง${pinLabel}) หรือแตะแผนที่`}
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              background: "transparent",
              fontFamily: "inherit",
              fontSize: ".9em",
              color: T.ink,
              minWidth: 0,
            }}
          />
        </div>

        {open && (
          <div
            id="cp-ac-list"
            role="listbox"
            className="cp-anim-rise"
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: "calc(100% + .35em)",
              zIndex: 30,
              background: T.panel,
              border: `1px solid ${T.line}`,
              borderRadius: "12px",
              boxShadow: T.shadowOverlay,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                fontSize: ".68em",
                fontWeight: 700,
                color: T.subInk,
                padding: ".5em .7em .2em",
                letterSpacing: ".03em",
              }}
            >
              {searching ? "กำลังค้นหา…" : sugs.length ? "ผลการค้นหา" : "ไม่พบสถานที่"}
            </div>
            {sugs.map((r, i) => (
              <button
                key={`${r.lat},${r.lon},${i}`}
                type="button"
                role="option"
                aria-selected={false}
                className="cp-focus"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(r)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: ".6em",
                  width: "100%",
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  textAlign: "left",
                  padding: ".55em .7em",
                  minHeight: "44px",
                  color: T.ink,
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: "1.7em",
                    height: "1.7em",
                    flex: "none",
                    borderRadius: "50%",
                    background: T.chip,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: ".85em",
                  }}
                >
                  📍
                </span>
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: ".86em",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {r.label}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* A/B fields + connector + swap */}
      <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: ".55em" }}>
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: "1.05em",
            top: "1.6em",
            bottom: "1.6em",
            width: "2px",
            background:
              "repeating-linear-gradient(to bottom,var(--cp-subink) 0 3px,transparent 3px 7px)",
            opacity: 0.45,
          }}
        />
        {fieldRow("start", "A", T.green, "ต้นทาง", startText, "แตะแผนที่ หรือค้นหาด้านบน")}
        {fieldRow("end", "B", T.red, "ปลายทาง", endText, "แตะแผนที่ หรือค้นหาด้านบน")}

        <button
          type="button"
          onClick={onSwap}
          aria-label="สลับต้นทางและปลายทาง"
          className="cp-focus"
          style={{
            position: "absolute",
            right: ".55em",
            top: "50%",
            transform: "translateY(-50%)",
            width: "2.1em",
            height: "2.1em",
            borderRadius: "50%",
            border: `1px solid ${T.line}`,
            background: T.panel,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 2px 6px rgba(0,0,0,.08)",
            zIndex: 2,
            fontSize: "1em",
            color: T.ink,
          }}
        >
          ⇅
        </button>
      </div>

      {/* algorithm */}
      <div style={{ display: "flex", gap: ".6em", alignItems: "center", marginTop: ".8em" }}>
        <label style={{ fontSize: ".78em", color: T.subInk, fontWeight: 600 }}>อัลกอริทึม</label>
        <div
          style={{
            display: "flex",
            background: T.chip,
            border: `1px solid ${T.line}`,
            borderRadius: "9px",
            padding: ".18em",
          }}
        >
          {(["idw", "kriging"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onMethodChange(m)}
              className="cp-focus"
              aria-pressed={method === m}
              style={{
                border: "none",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: ".8em",
                fontWeight: 600,
                padding: ".35em .75em",
                borderRadius: "7px",
                minHeight: "36px",
                background: method === m ? T.teal : "transparent",
                color: method === m ? "#fff" : T.subInk,
              }}
            >
              {m === "idw" ? "IDW" : "Kriging"}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={onCompare}
        disabled={!canCompare || comparing}
        className="cp-focus"
        style={{
          marginTop: ".9em",
          width: "100%",
          minHeight: "52px",
          border: "none",
          borderRadius: "12px",
          cursor: canCompare && !comparing ? "pointer" : "not-allowed",
          fontFamily: "inherit",
          fontWeight: 700,
          fontSize: "1.02em",
          color: "#fff",
          background: canCompare ? T.brandGrad : "#cdd3d1",
          boxShadow: canCompare ? T.shadowBrand : "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: ".55em",
          opacity: comparing ? 0.95 : 1,
        }}
      >
        {comparing ? (
          <>
            <span
              className="cp-anim-spin"
              aria-hidden
              style={{
                width: "1.1em",
                height: "1.1em",
                border: "2.5px solid rgba(255,255,255,.4)",
                borderTopColor: "#fff",
                borderRadius: "50%",
              }}
            />
            <span>กำลังคำนวณเส้นทาง…</span>
          </>
        ) : (
          <span>เปรียบเทียบเส้นทาง</span>
        )}
      </button>
    </section>
  );
}
