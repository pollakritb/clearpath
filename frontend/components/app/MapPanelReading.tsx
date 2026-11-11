import type { CSSProperties, ReactNode } from "react";
import { classifyPm25 } from "@/frontend/lib/aqi";
import styles from "./MapPanel.module.css";

export default function MapPanelReading({
  value,
  status,
  caption,
  stale = false,
  showPreviousColour = false,
}: {
  value: number | null | undefined;
  status?: string;
  caption?: ReactNode;
  stale?: boolean;
  showPreviousColour?: boolean;
}) {
  const classification = classifyPm25(
    stale && !showPreviousColour ? null : value,
  );
  return (
    <>
      {value == null ? (
        <div className={styles.empty}>
          <strong>{status ?? "ยังไม่มีค่าปัจจุบัน"}</strong>
          {caption && <span>{caption}</span>}
        </div>
      ) : (
        <>
          <div
            data-pm25-reading
            className={styles.reading}
            style={{ "--reading-color": classification.color } as CSSProperties}
          >
            <div className={styles.value}>
              <strong>{value}</strong>
              <small>µg/m³ · PM2.5</small>
            </div>
            <span className={styles.level}>
              <i aria-hidden="true" />
              {status ?? (stale ? "ข้อมูลก่อนหน้า" : classification.level)}
            </span>
          </div>
          {caption && <div className={styles.time}>{caption}</div>}
        </>
      )}
    </>
  );
}
