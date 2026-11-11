"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/frontend/lib/api-client";
import { classifyPm25 } from "@/frontend/lib/aqi";
import { sourceTimeLabel } from "@/frontend/lib/reading-time";
import {
  stationHistorySlots,
  stationHistorySummary,
} from "@/frontend/lib/station-insights";
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
const time = (at: number) =>
  new Date(at).toLocaleTimeString("th-TH", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function StationInsights({
  station,
  enabled,
  historicalAt,
}: {
  station: Station;
  enabled: boolean;
  historicalAt?: string | null;
}) {
  const [state, setState] = useState<{
    points: HistoryPoint[];
    status: "loading" | "ready" | "error";
  }>({ points: [], status: "loading" });
  const [retry, setRetry] = useState(0);
  const [selectedHour, setSelected] = useState<number | null>(null);
  const [reference] = useState(() =>
    historicalAt ? Date.parse(historicalAt) : Date.now(),
  );
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void api
      .history(station.id, 24)
      .then((result) => {
        if (!cancelled) setState({ points: result.points, status: "ready" });
      })
      .catch(() => {
        if (!cancelled) setState({ points: [], status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [station.id, enabled, retry]);
  const slots = useMemo(
    () => stationHistorySlots(state.points, reference),
    [state.points, reference],
  );
  const summary = stationHistorySummary(slots);
  const selected =
    selectedHour ??
    Math.max(
      0,
      slots.findLastIndex((slot) => slot.value != null),
    );
  const valid =
    station.pm25 != null && Number.isFinite(station.pm25) && station.pm25 >= 0;
  const classification = classifyPm25(valid ? station.pm25 : null);
  const band = valid ? bands.findIndex((b) => station.pm25! <= b.max) : -1;
  const current = !historicalAt && currentStationValue(station) != null;
  const yMax = Math.max(80, Math.ceil((summary.max ?? 0) / 20) * 20);
  const x = (i: number) => 28 + (i / 23) * 270;
  const y = (v: number) => 130 - (v / yMax) * 112;
  const path = slots
    .map((slot, i) => {
      if (slot.value == null) {
        return "";
      }
      const command = i > 0 && slots[i - 1].value != null ? "L" : "M";
      return `${command}${x(i)},${y(slot.value)}`;
    })
    .join(" ");
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

      <section className={styles.section} aria-label="แนวโน้มค่าฝุ่นย้อนหลัง">
        <h2>ค่าฝุ่นย้อนหลัง 24 ชั่วโมง</h2>
        {state.status === "loading" ? (
          <p role="status">กำลังโหลดค่าฝุ่นย้อนหลัง…</p>
        ) : state.status === "error" ? (
          <div role="status">
            <p>โหลดค่าฝุ่นย้อนหลังไม่สำเร็จ</p>
            <button
              className={styles.retry}
              onClick={() => {
                setState({ points: [], status: "loading" });
                setRetry((n) => n + 1);
              }}
            >
              ลองใหม่
            </button>
          </div>
        ) : summary.count === 0 ? (
          <p>ยังไม่มีข้อมูลย้อนหลังในช่วงนี้</p>
        ) : (
          <>
            <p className={styles.trend}>
              {summary.delta == null
                ? "ข้อมูลไม่พอเปรียบเทียบกับชั่วโมงก่อน"
                : summary.delta === 0
                  ? "ค่าล่าสุดเท่ากับชั่วโมงก่อน"
                  : `${summary.delta > 0 ? "เพิ่มขึ้น" : "ลดลง"} ${Math.abs(summary.delta).toFixed(1)} µg/m³`}
            </p>
            {summary.delta != null && (
              <p className={styles.comparison}>เทียบชั่วโมงก่อนข้อมูลล่าสุด</p>
            )}
            <div className={styles.selected} aria-live="polite">
              <span>
                {sourceTimeLabel(
                  slots[selected].recordedAt ??
                    new Date(slots[selected].at).toISOString(),
                )}
              </span>
              <strong>
                {slots[selected].value == null ? (
                  "ไม่มีข้อมูล"
                ) : (
                  <>
                    {slots[selected].value!.toFixed(1)} <small>µg/m³</small>
                  </>
                )}
              </strong>
            </div>
            <svg
              viewBox="0 0 320 140"
              className={styles.chart}
              role="img"
              aria-label="กราฟค่าฝุ่นย้อนหลังตามเวลา ช่องว่างคือช่วงที่ไม่มีข้อมูล"
              onClick={(e) => {
                const box = e.currentTarget.getBoundingClientRect();
                setSelected(
                  Math.max(
                    0,
                    Math.min(
                      23,
                      Math.round(
                        ((((e.clientX - box.left) / box.width) * 320 - 28) /
                          270) *
                          23,
                      ),
                    ),
                  ),
                );
              }}
            >
              {[0, yMax / 2, yMax].map((v) => (
                <g key={v}>
                  <line x1="28" x2="298" y1={y(v)} y2={y(v)} stroke="#dce5e2" />
                  <text x="22" y={y(v) + 4} textAnchor="end">
                    {v}
                  </text>
                </g>
              ))}
              <path d={path} fill="none" stroke="#087e78" strokeWidth="2.5" />
              {slots.map(
                (s, i) =>
                  s.value != null && (
                    <circle
                      key={s.at}
                      cx={x(i)}
                      cy={y(s.value)}
                      r={selected === i ? 5 : 2.5}
                      fill={classifyPm25(s.value).color}
                      stroke="#233b36"
                      strokeWidth="1"
                    />
                  ),
              )}
              <line
                x1={x(selected)}
                x2={x(selected)}
                y1="14"
                y2="132"
                stroke="#576c67"
                strokeDasharray="3 3"
              />
            </svg>
            <div className={styles.timeAxis} aria-hidden="true">
              {[0, 12, 23].map((i) => (
                <span key={i}>{time(slots[i].at)}</span>
              ))}
            </div>
            <label className={styles.scrubber}>
              เลื่อนเลือกเวลา
              <input
                aria-label="เลือกชั่วโมงในกราฟค่าฝุ่น"
                aria-valuetext={`${time(slots[selected].at)} · ${slots[selected].value == null ? "ไม่มีข้อมูล" : `${slots[selected].value} ไมโครกรัมต่อลูกบาศก์เมตร`}`}
                type="range"
                min="0"
                max="23"
                step="1"
                value={selected}
                onChange={(e) => setSelected(Number(e.target.value))}
              />
            </label>

            <div className={styles.extremes}>
              <span>
                ต่ำสุด <b>{summary.min?.toFixed(1)}</b>
              </span>
              <span>
                สูงสุด <b>{summary.max?.toFixed(1)}</b>
              </span>
              <small>µg/m³ · จากข้อมูลที่มี</small>
            </div>
            <p className={styles.note}>
              มีข้อมูล {summary.count}/24 ช่วงชั่วโมง
              {summary.count < 24
                ? " · ข้อมูลไม่ครบ ช่องว่างไม่ได้หมายถึงค่าฝุ่นเป็นศูนย์"
                : ""}
            </p>
          </>
        )}
      </section>

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
        <small>หน่วย µg/m³ · เกณฑ์สี PM2.5 ของกรมควบคุมมลพิษ</small>
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
