import { classifyPm25 } from "@/frontend/lib/aqi";
import { T } from "@/frontend/lib/ui";
import type { Station } from "@/frontend/types";

export default function NationalSummary({ stations }: { stations: Station[] }) {
  const values = stations.flatMap((station) =>
    station.pm25 == null || !station.eligible_for_surface ? [] : [station.pm25],
  );
  if (!values.length) return null;

  const average =
    Math.round(
      (values.reduce((sum, value) => sum + value, 0) / values.length) * 10,
    ) / 10;
  const metrics = [
    ["เฉลี่ยประเทศ", average],
    ["สูงสุด", Math.max(...values)],
  ] as const;

  return (
    <section className="cp-summary-grid">
      {metrics.map(([label, value]) => {
        const classification = classifyPm25(value);
        return (
          <div
            key={label}
            style={{
              background: classification.tint,
              border: `1px solid ${classification.color}55`,
              borderRadius: "11px",
              padding: ".7em",
            }}
          >
            <div style={{ fontSize: ".68em", color: T.subInk }}>{label}</div>
            <b
              style={{
                fontFamily: T.mono,
                fontSize: "1.45em",
                color: classification.color,
              }}
            >
              {value}
            </b>
            <span style={{ fontSize: ".64em" }}> µg/m³</span>
          </div>
        );
      })}
    </section>
  );
}
