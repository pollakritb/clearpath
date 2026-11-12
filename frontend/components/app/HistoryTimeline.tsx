"use client";

import { useMemo, useState } from "react";
import { classifyPm25 } from "@/frontend/lib/aqi";
import { sourceTimeLabel } from "@/frontend/lib/reading-time";
import {
  stationHistorySlots,
  stationHistorySummary,
} from "@/frontend/lib/station-insights";
import type { HistoryPoint } from "@/frontend/types";
import styles from "./StationInsights.module.css";
const time = (at: number) =>
  new Date(at).toLocaleTimeString("th-TH", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function HistoryTimeline({
  points,
  reference,
  status,
  onRetry,
}: {
  points: HistoryPoint[];
  reference: number;
  status: "loading" | "ready" | "error";
  onRetry?: () => void;
}) {
  const [selectedHour, setSelected] = useState<number | null>(null);
  const slots = useMemo(
    () => stationHistorySlots(points, reference),
    [points, reference],
  );
  const summary = stationHistorySummary(slots);
  const selected =
    selectedHour ??
    Math.max(
      0,
      slots.findLastIndex((slot) => slot.value != null),
    );
  const yMax = Math.max(80, Math.ceil((summary.max ?? 0) / 20) * 20);
  const x = (i: number) => 36 + (i / 23) * 262;
  const y = (v: number) => 130 - (v / yMax) * 112;
  const path = slots
    .map((slot, i) =>
      slot.value == null
        ? ""
        : `${i > 0 && slots[i - 1].value != null ? "L" : "M"}${x(i)},${y(slot.value)}`,
    )
    .join(" ");
  return (
    <section className={styles.section} aria-label="แนวโน้มค่าฝุ่นย้อนหลัง">
      <h2>ค่าฝุ่นย้อนหลัง 24 ชั่วโมง</h2>
      {status === "loading" ? (
        <p role="status">กำลังโหลดค่าฝุ่นย้อนหลัง…</p>
      ) : status === "error" ? (
        <div role="status">
          <p>โหลดค่าฝุ่นย้อนหลังไม่สำเร็จ</p>
          <button
            className={styles.retry}
            onClick={() => {
              onRetry?.();
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
                      ((((e.clientX - box.left) / box.width) * 320 - 36) /
                        262) *
                        23,
                    ),
                  ),
                ),
              );
            }}
          >
            {[0, yMax / 2, yMax].map((v) => (
              <g key={v}>
                <line x1="36" x2="298" y1={y(v)} y2={y(v)} stroke="#dce5e2" />
                <text x="30" y={y(v) + 4} textAnchor="end">
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
            กราฟแสดงค่าตามเวลาที่รายงาน ไม่ใช่ค่าเฉลี่ย 24 ชั่วโมงที่คำนวณใหม่
          </p>
          <p className={styles.note}>
            มีข้อมูล {summary.count}/24 ช่วงชั่วโมง
            {summary.count < 24
              ? " · ข้อมูลไม่ครบ ช่องว่างไม่ได้หมายถึงค่าฝุ่นเป็นศูนย์"
              : ""}
          </p>
        </>
      )}
    </section>
  );
}
