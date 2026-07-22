"use client";

import { T } from "@/frontend/lib/ui";
import type { LoocvMetrics, ValidationResponse } from "@/frontend/types";

export interface ModelAccuracyProps {
  data: ValidationResponse | null;
  loading: boolean;
  error: string | null;
  onLoad: () => void;
}

const DASH = "—";
const fmt = (v: number | null, digits = 2) =>
  v === null || v === undefined ? DASH : v.toFixed(digits);
const fmtSkill = (v: number | null) =>
  v === null || v === undefined
    ? DASH
    : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(0)}%`;

interface Row {
  label: string;
  m: LoocvMetrics | null;
  baseline?: boolean;
  best?: boolean;
}

function Cell({
  children,
  color,
}: {
  children: React.ReactNode;
  color?: string;
}) {
  return (
    <td
      style={{
        fontFamily: T.mono,
        fontSize: ".82em",
        textAlign: "right",
        padding: ".3em .25em",
        color: color ?? T.ink,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </td>
  );
}

export default function ModelAccuracy({
  data,
  loading,
  error,
  onLoad,
}: ModelAccuracyProps) {
  return (
    <section
      aria-label="ความแม่นยำของแบบจำลอง"
      style={{ borderTop: `1px solid ${T.line}`, paddingTop: "1em" }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: ".5em",
        }}
      >
        <h2 style={{ margin: 0, fontSize: ".92em", fontWeight: 700 }}>
          ความแม่นยำของแบบจำลอง
        </h2>
        <span
          style={{ fontSize: ".68em", color: T.subInk, fontFamily: T.mono }}
        >
          LOOCV
        </span>
      </div>

      {!data && (
        <>
          <p style={{ fontSize: ".78em", color: T.subInk, margin: "0 0 .6em" }}>
            ตรวจความแม่นยำของการประมาณค่าฝุ่นด้วย Leave-One-Out Cross-Validation
            เทียบ IDW กับ Kriging และเกณฑ์พื้นฐาน
          </p>
          <button
            type="button"
            onClick={onLoad}
            disabled={loading}
            className="cp-focus"
            style={{
              width: "100%",
              minHeight: "44px",
              border: "none",
              borderRadius: "10px",
              cursor: loading ? "wait" : "pointer",
              fontFamily: "inherit",
              fontWeight: 700,
              fontSize: ".88em",
              color: "#fff",
              background: T.brandGrad,
              boxShadow: T.shadowBrand,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: ".5em",
            }}
          >
            {loading ? (
              <>
                <span
                  className="cp-anim-spin"
                  aria-hidden
                  style={{
                    width: "1em",
                    height: "1em",
                    border: "2.5px solid rgba(255,255,255,.4)",
                    borderTopColor: "#fff",
                    borderRadius: "50%",
                  }}
                />
                กำลังตรวจ (LOOCV)…
              </>
            ) : (
              <>🔬 ตรวจความแม่นยำ IDW vs Kriging</>
            )}
          </button>
          {error && (
            <p
              style={{ fontSize: ".76em", color: "#c2433a", marginTop: ".5em" }}
            >
              {error}
            </p>
          )}
        </>
      )}

      {data && <Results data={data} />}
    </section>
  );
}

function Results({ data }: { data: ValidationResponse }) {
  const rows: Row[] = [
    { label: "IDW", m: data.idw, best: data.better === "idw" },
    { label: "Kriging", m: data.kriging, best: data.better === "kriging" },
    { label: "สถานีใกล้สุด", m: data.nearest, baseline: true },
    { label: "ค่าเฉลี่ยรวม", m: data.mean, baseline: true },
  ];

  return (
    <div className="cp-anim-rise">
      <p style={{ fontSize: ".74em", color: T.subInk, margin: "0 0 .55em" }}>
        Leave-One-Out CV บน{" "}
        <b style={{ fontFamily: T.mono, color: T.ink }}>{data.station_count}</b>{" "}
        สถานีจริง — ถอดทีละสถานี ทำนายจากที่เหลือ แล้วเทียบค่าจริง (ค่าน้อย =
        แม่นกว่า)
      </p>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ color: T.subInk, fontSize: ".7em", textAlign: "right" }}>
            <th
              style={{
                textAlign: "left",
                fontWeight: 600,
                padding: ".2em .25em",
              }}
            >
              วิธี
            </th>
            <th style={{ fontWeight: 600, padding: ".2em .25em" }}>RMSE</th>
            <th style={{ fontWeight: 600, padding: ".2em .25em" }}>MAE</th>
            <th style={{ fontWeight: 600, padding: ".2em .25em" }}>R²</th>
            <th style={{ fontWeight: 600, padding: ".2em .25em" }}>Skill</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.label}
              style={{
                borderTop: `1px solid ${T.line}`,
                background: r.best ? "rgba(43,191,115,.1)" : "transparent",
              }}
            >
              <td
                style={{
                  fontSize: ".82em",
                  padding: ".3em .25em",
                  fontWeight: r.best ? 800 : r.baseline ? 400 : 600,
                  color: r.baseline ? T.subInk : T.ink,
                }}
              >
                {r.best && <span style={{ color: T.green }}>★ </span>}
                {r.label}
                {r.baseline && (
                  <span style={{ fontSize: ".82em", color: T.subInk }}>
                    {" "}
                    · baseline
                  </span>
                )}
              </td>
              {r.m ? (
                <>
                  <Cell color={r.best ? T.green : undefined}>
                    {fmt(r.m.rmse)}
                  </Cell>
                  <Cell>{fmt(r.m.mae)}</Cell>
                  <Cell color={(r.m.r2 ?? 0) < 0 ? "#c2433a" : undefined}>
                    {fmt(r.m.r2, 2)}
                  </Cell>
                  <Cell
                    color={
                      (r.m.skill ?? 0) > 0
                        ? T.green
                        : (r.m.skill ?? 0) < 0
                          ? "#c2433a"
                          : T.subInk
                    }
                  >
                    {r.baseline && r.label === "ค่าเฉลี่ยรวม"
                      ? DASH
                      : fmtSkill(r.m.skill)}
                  </Cell>
                </>
              ) : (
                <td
                  colSpan={4}
                  style={{
                    textAlign: "right",
                    fontSize: ".76em",
                    color: T.subInk,
                    padding: ".3em .25em",
                  }}
                >
                  ไม่พร้อม
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      <p
        style={{
          fontSize: ".68em",
          color: T.subInk,
          lineHeight: 1.5,
          margin: ".6em 0 0",
        }}
      >
        RMSE/MAE หน่วย µg/m³ · R² 1=สมบูรณ์แบบ 0=เท่าค่าเฉลี่ย · Skill เทียบ
        baseline ค่าเฉลี่ยรวม
        {data.idw && (data.idw.r2 ?? 0) < 0 && (
          <>
            {" "}
            <span style={{ color: T.ink }}>
              — ค่า R² ต่ำ/ติดลบในขณะนี้สะท้อนว่าฝุ่นกระจายค่อนข้างสม่ำเสมอ
              (ความต่างเชิงพื้นที่น้อย) การ interpolate จึงได้ใกล้ค่าเฉลี่ย
              ในวันที่ฝุ่นมีโครงสร้างเชิงพื้นที่ชัด ค่าจะดีขึ้น
            </span>
          </>
        )}
      </p>
    </div>
  );
}
