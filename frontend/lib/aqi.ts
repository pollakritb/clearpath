// มาตรฐานการแสดงผล PM2.5 ฝั่ง client — แหล่งความจริงของ "สี/ไอคอน/ระดับ" บน UI
// คำนวณจากค่า pm25 โดยตรง (เหมือน design) เพื่อให้การ์ด/หมุด/legend สอดคล้องกันเสมอ
// ระดับ + เกณฑ์ตรงกับ backend/core/aqi.py — เปลี่ยนเฉพาะ "สี/ไอคอน" ตามดีไซน์ใหม่
//
// AQI สื่อความหมายด้วย สี + ไอคอนรูปทรง + ข้อความ เสมอ (รองรับ color-blind + screen reader)

export type AqiLevelKey =
  | "good"
  | "moderate"
  | "sensitive"
  | "unhealthy"
  | "hazard"
  | "unknown";

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
    25,
    "good",
    "ดี",
    "#27ae60",
    "●",
    "rgba(39,174,96,.12)",
    "อากาศดี เหมาะกับกิจกรรมกลางแจ้งทุกประเภท",
  ],
  [
    37,
    "moderate",
    "ปานกลาง",
    "#d4ac0d",
    "◆",
    "rgba(212,172,13,.14)",
    "คุณภาพอากาศปานกลาง คนทั่วไปทำกิจกรรมได้ตามปกติ",
  ],
  [
    50,
    "sensitive",
    "เริ่มมีผล",
    "#e67e22",
    "▲",
    "rgba(230,126,34,.14)",
    "ผู้สูงอายุและผู้มีโรคทางเดินหายใจควรลดกิจกรรมกลางแจ้ง",
  ],
  [
    90,
    "unhealthy",
    "มีผลต่อสุขภาพ",
    "#e74c3c",
    "■",
    "rgba(231,76,60,.14)",
    "กลุ่มเสี่ยงและผู้สูงอายุควรเลี่ยงกิจกรรมกลางแจ้ง สวมหน้ากาก",
  ],
  [
    Infinity,
    "hazard",
    "อันตราย",
    "#8e44ad",
    "✦",
    "rgba(142,68,173,.14)",
    "ทุกคนควรงดกิจกรรมกลางแจ้งและสวมหน้ากาก N95",
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
  { range: "0–25", level: "ดี", color: "#27ae60", glyph: "●" },
  { range: "26–37", level: "ปานกลาง", color: "#d4ac0d", glyph: "◆" },
  { range: "38–50", level: "เริ่มมีผล", color: "#e67e22", glyph: "▲" },
  { range: "51–90", level: "มีผลต่อสุขภาพ", color: "#e74c3c", glyph: "■" },
  { range: ">90", level: "อันตราย", color: "#8e44ad", glyph: "✦" },
];
