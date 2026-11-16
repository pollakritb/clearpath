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
  {
    range: "37.6–75",
    level: "เริ่มมีผลกระทบต่อสุขภาพ",
    color: "#f97316",
    glyph: "■",
  },
  { range: "≥75.1", level: "มีผลกระทบต่อสุขภาพ", color: "#ef4444", glyph: "✦" },
];

/** Forecast-only display scale supplied for CAMS. Decimal values use inclusive upper bounds. */
export const FORECAST_LEGEND = [
  {
    upper: 5,
    range: "0–5",
    level: "ดี",
    color: "#50f0e6",
    glyph: "●",
    advice: "คุณภาพอากาศดีมาก",
  },
  {
    upper: 15,
    range: ">5–15",
    level: "ปานกลาง",
    color: "#50ccaa",
    glyph: "◆",
    advice: "คุณภาพอากาศยอมรับได้",
  },
  {
    upper: 50,
    range: ">15–50",
    level: "ปานกลาง (เริ่มเฝ้าระวัง)",
    color: "#f0e641",
    glyph: "▲",
    advice: "กลุ่มเปราะบางควรระวัง",
  },
  {
    upper: 90,
    range: ">50–90",
    level: "เริ่มมีผลกระทบ",
    color: "#ff5050",
    glyph: "■",
    advice: "กลุ่มเสี่ยงควรลดกิจกรรมกลางแจ้ง",
  },
  {
    upper: 140,
    range: ">90–140",
    level: "มีผลกระทบ",
    color: "#960032",
    glyph: "✦",
    advice: "มีผลกระทบต่อสุขภาพของประชาชนทั่วไป",
  },
  {
    upper: Infinity,
    range: ">140",
    level: "อันตรายมาก",
    color: "#7d2181",
    glyph: "⬟",
    advice: "ควรงดกิจกรรมกลางแจ้ง",
  },
];
const luminance = (hex: string) => {
  const channels = [1, 3, 5].map((offset) => {
    const s = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
};
function forecastTypography(color: string) {
  let textColor = color;
  // Preserve the category hue, darkening only text displayed on a light surface.
  while (1.05 / (luminance(textColor) + 0.05) < 7) {
    textColor =
      "#" +
      [1, 3, 5]
        .map((offset) =>
          Math.floor(
            Number.parseInt(textColor.slice(offset, offset + 2), 16) * 0.9,
          )
            .toString(16)
            .padStart(2, "0"),
        )
        .join("");
  }
  const level = luminance(color);
  const foreground =
    (level + 0.05) / (luminance("#07130f") + 0.05) >= 1.05 / (level + 0.05)
      ? "#07130f"
      : "#ffffff";
  return { textColor, foreground };
}
const FORECAST_TYPOGRAPHY = Object.fromEntries(
  FORECAST_LEGEND.map((band) => [band.color, forecastTypography(band.color)]),
);
export function classifyForecastPm25(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value) || value < 0)
    return { ...UNKNOWN, ...forecastTypography(UNKNOWN.color) };
  const band = FORECAST_LEGEND.find((b) => value <= b.upper)!;
  return {
    ...band,
    tint: `${band.color}20`,
    ...FORECAST_TYPOGRAPHY[band.color],
  };
}
export function forecastColor(value: number | null | undefined): string {
  return classifyForecastPm25(value).color;
}
export function forecastColorPacked(value: number): number {
  return Number.parseInt(forecastColor(value).slice(1), 16);
}
