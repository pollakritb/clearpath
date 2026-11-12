"use client";

import { useEffect, useState } from "react";
import { api } from "@/frontend/lib/api-client";
import { classifyPm25 } from "@/frontend/lib/aqi";
import HistoryTimeline from "./HistoryTimeline";
import { currentStationValue } from "@/frontend/lib/station-display";
import type { HistoryPoint, Station } from "@/frontend/types";
import styles from "./StationInsights.module.css";

const bands = [
  { max: 15, label: "ดีมาก", range: "0–15.0" },
  { max: 25, label: "ดี", range: "15.1–25.0" },
  { max: 37.5, label: "ปานกลาง", range: "25.1–37.5" },
  { max: 75, label: "เริ่มมีผลกระทบต่อสุขภาพ", range: "37.6–75.0" },
  { max: Infinity, label: "มีผลกระทบต่อสุขภาพ", range: "≥75.1" },
];

export default function StationInsights({
  station,
  enabled,
  historicalAt,
}: {
  station: Station;
  enabled: boolean;
  historicalAt?: string | null;
}) {
  const [retry, setRetry] = useState(0);
  const requestKey = `${station.id}:${historicalAt ?? "live"}:${enabled}:${retry}`;
  const [state, setState] = useState<{
    points: HistoryPoint[];
    status: "loading" | "ready" | "error";
    reference: number;
    key: string;
  }>({ points: [], status: "loading", reference: 0, key: "" });
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const reference = historicalAt ? Date.parse(historicalAt) : Date.now();
    void api
      .history(
        station.id,
        24,
        new Date(reference).toISOString(),
        controller.signal,
      )
      .then((result) => {
        if (!controller.signal.aborted)
          setState({
            points: result.points,
            status: "ready",
            reference,
            key: requestKey,
          });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setState({ points: [], status: "error", reference, key: requestKey });
      });
    return () => controller.abort();
  }, [station.id, enabled, historicalAt, requestKey]);
  const valid =
    station.pm25 != null && Number.isFinite(station.pm25) && station.pm25 >= 0;
  const classification = classifyPm25(valid ? station.pm25 : null);
  const band = valid ? bands.findIndex((b) => station.pm25! <= b.max) : -1;
  const current = !historicalAt && currentStationValue(station) != null;
  const risk =
    band >= 3
      ? "ลดกิจกรรมกลางแจ้ง และติดตามอาการอย่างใกล้ชิด"
      : "สังเกตอาการและติดตามค่าฝุ่น โดยเฉพาะผู้มีโรคหัวใจหรือระบบทางเดินหายใจ";

  return (
    <div className={styles.root}>
      <section
        className={`${styles.section} ${styles.levelSection}`}
        aria-label="ระดับค่าฝุ่นที่บันทึก"
      >
        <h2>ค่าที่บันทึกอยู่ระดับไหน</h2>
        <div
          className={styles.scale}
          aria-label={
            valid
              ? `${station.pm25} ไมโครกรัมต่อลูกบาศก์เมตร ระดับ${classification.level} ณ เวลาที่วัด`
              : "ไม่มีค่าฝุ่นสำหรับแปลผล"
          }
        >
          {bands.map((b, i) => (
            <div
              key={b.range}
              style={
                {
                  "--band": classifyPm25(i === 4 ? 76 : b.max).color,
                } as React.CSSProperties
              }
              data-active={band === i}
            >
              <span aria-hidden="true" />
              {band === i && (
                <b aria-hidden="true">
                  <svg viewBox="0 0 12 8">
                    <path d="M6 0 12 8H0Z" fill="currentColor" />
                  </svg>
                </b>
              )}
            </div>
          ))}
        </div>
        <p className={styles.emphasis}>
          {valid
            ? `${classification.level} ณ เวลาที่วัด`
            : "ยังไม่มีค่าฝุ่นที่ใช้แปลผลได้"}
        </p>
      </section>

      <HistoryTimeline
        key={state.reference}
        points={state.points}
        reference={state.reference}
        status={state.key === requestKey ? state.status : "loading"}
        onRetry={() => setRetry((n) => n + 1)}
      />

      {valid && (
        <section className={styles.section} aria-label="คำแนะนำตามระดับค่าฝุ่น">
          <h2>คำแนะนำตามค่าที่บันทึก</h2>
          {!current && (
            <p className={styles.notice}>
              ข้อมูลนี้เป็นค่าก่อนหน้า ควรตรวจค่าล่าสุดก่อนตัดสินใจทำกิจกรรม
            </p>
          )}
          <dl className={styles.advice}>
            <div>
              <dt>ทั่วไป</dt>
              <dd>{classification.advice}</dd>
            </div>
            <div>
              <dt>กลุ่มเสี่ยง</dt>
              <dd>{risk}</dd>
            </div>
          </dl>
          <a
            className={styles.source}
            href="https://www.anamai.moph.go.th/th/news-anamai/44896"
            target="_blank"
            rel="noopener noreferrer"
          >
            คำแนะนำจากกรมอนามัย (เปิดแท็บใหม่)
          </a>
        </section>
      )}
      <details className={styles.details}>
        <summary>ดูเกณฑ์ทั้ง 5 ระดับ</summary>
        {bands.map((b) => (
          <div className={styles.legend} key={b.range}>
            <span>{b.label}</span>
            <b>{b.range}</b>
          </div>
        ))}
        <small>
          หน่วย µg/m³ · เกณฑ์สี PM2.5 ของกรมควบคุมมลพิษอ้างอิงค่าเฉลี่ย 24
          ชั่วโมง
        </small>
        <a
          className={styles.source}
          href="https://air4thai.pcd.go.th/webV3/"
          target="_blank"
          rel="noopener noreferrer"
        >
          ที่มาเกณฑ์คุณภาพอากาศ (เปิดแท็บใหม่)
        </a>
      </details>
      <details className={styles.details}>
        <summary>ข้อมูลสถานีและที่มา</summary>
        <p>
          {station.province ?? "ประเทศไทย"} · รหัสสถานี {station.id}
        </p>
        <p>
          ค่าตรวจวัดจาก Air4Thai ตามเวลาต้นทาง
          ค่าพยากรณ์เป็นผลจากแบบจำลองและแสดงแยกจากผลตรวจวัด
        </p>
      </details>
    </div>
  );
}
