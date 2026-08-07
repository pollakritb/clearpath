import { classifyPm25 } from "@/frontend/lib/aqi";
import { T } from "@/frontend/lib/ui";
import type { Station } from "@/frontend/types";

export default function NationalSummary({ stations }: { stations: Station[] }) {
  const currentValues = stations.flatMap((station) =>
    station.pm25 == null || !station.eligible_for_surface ? [] : [station.pm25],
  );
  const latestValues = stations.flatMap((station) =>
    station.pm25 == null ? [] : [station.pm25],
  );
  const referenceOnly = !currentValues.length && latestValues.length > 0;
  const values = currentValues.length ? currentValues : latestValues;
  if (!values.length) return null;

  const average =
    Math.round(
      (values.reduce((sum, value) => sum + value, 0) / values.length) * 10,
    ) / 10;
  const metrics = [
    [referenceOnly ? "เฉลี่ยข้อมูลล่าสุด" : "เฉลี่ยทั่วประเทศ", average],
    [
      referenceOnly ? "สูงสุดในข้อมูลล่าสุด" : "ค่าสูงสุดในพื้นที่",
      Math.max(...values),
    ],
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
