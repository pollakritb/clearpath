// มาตรฐานการแสดงผล PM2.5 ฝั่ง client — แหล่งความจริงของ "สี/ไอคอน/ระดับ" บน UI
// คำนวณจากค่า pm25 โดยตรง (เหมือน design) เพื่อให้การ์ด/หมุด/legend สอดคล้องกันเสมอ
// ระดับ + เกณฑ์ตรงกับ backend/core/aqi.py — เปลี่ยนเฉพาะ "สี/ไอคอน" ตามดีไซน์ใหม่
//
// AQI สื่อความหมายด้วย สี + ไอคอนรูปทรง + ข้อความ เสมอ (รองรับ color-blind + screen reader)

export type AqiLevelKey =
  "very_good" | "good" | "moderate" | "sensitive" | "unhealthy" | "unknown";

export interface AqiClass {
  levelKey: AqiLevelKey;
  level: string; // ป้ายภาษาไทย (ฟิลด์เดิมที่ทั้งแอปใช้)
  color: string; // hex สำหรับเลข/หมุด/หัวการ์ด
  glyph: string; // ● ◆ ▲ ■ ✦ — รูปทรงต่อระดับ
  tint: string; // พื้นโปร่งสำหรับ tag/แถบ
  advice: string;
}

// [upper_inclusive, levelKey, label, color, glyph, tint, advice]
const BANDS: [number, AqiLevelKey, string, string, string, string, string][] = [
  [
    15,
    "very_good",
    "ดีมาก",
    "#3b82f6",
    "●",
    "rgba(59,130,246,.12)",
    "อากาศดีมาก เหมาะกับกิจกรรมกลางแจ้ง",
  ],
  [
    25,
    "good",
    "ดี",
    "#22c55e",
    "◆",
    "rgba(34,197,94,.12)",
    "อากาศดี ทำกิจกรรมได้ตามปกติ",
  ],
  [
    37.5,
    "moderate",
    "ปานกลาง",
    "#eab308",
    "▲",
    "rgba(234,179,8,.14)",
    "กลุ่มเสี่ยงควรสังเกตอาการ",
  ],
  [
    75,
    "sensitive",
    "เริ่มมีผลกระทบต่อสุขภาพ",
    "#f97316",
    "■",
    "rgba(249,115,22,.14)",
    "กลุ่มเสี่ยงควรลดกิจกรรมกลางแจ้ง",
  ],
  [
    Infinity,
    "unhealthy",
    "มีผลกระทบต่อสุขภาพ",
    "#ef4444",
    "✦",
    "rgba(239,68,68,.14)",
    "ทุกคนควรลดกิจกรรมนอกบ้านและสวมหน้ากาก",
  ],
];

const UNKNOWN: AqiClass = {
  levelKey: "unknown",
  level: "ไม่มีข้อมูล",
  color: "#95a5a6",
  glyph: "○",
  tint: "rgba(149,165,166,.12)",
  advice: "ไม่มีข้อมูล",
};

export function classifyPm25(pm25: number | null | undefined): AqiClass {
  if (pm25 == null || Number.isNaN(pm25)) return UNKNOWN;
  for (const [upper, levelKey, level, color, glyph, tint, advice] of BANDS) {
    if (pm25 <= upper) return { levelKey, level, color, glyph, tint, advice };
  }
  return UNKNOWN;
}

// legend บนแผนที่ (5 ระดับ + ไอคอน)
export const AQI_LEGEND = [
  { range: "0–15", level: "ดีมาก", color: "#3b82f6", glyph: "●" },
  { range: "15.1–25", level: "ดี", color: "#22c55e", glyph: "◆" },
  { range: "25.1–37.5", level: "ปานกลาง", color: "#eab308", glyph: "▲" },
  { range: "37.6–75", level: "เริ่มมีผล", color: "#f97316", glyph: "■" },
  { range: "≥75.1", level: "มีผลต่อสุขภาพ", color: "#ef4444", glyph: "✦" },
];
