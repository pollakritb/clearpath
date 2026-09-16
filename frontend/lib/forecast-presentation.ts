import type {
  ForecastPoint,
  ForecastResponse,
  ForecastSource,
} from "@/frontend/types";

export const PRODUCT_HORIZONS = [1, 3, 6, 12, 24] as const;

export const FORECAST_SOURCE_LABELS: Record<ForecastSource, string> = {
  clearpath: "ClearPath",
  gistda: "GISTDA เช็คฝุ่น",
  openmeteo_cams: "CAMS / Open-Meteo",
  openweather: "OpenWeather",
};

export const FORECAST_SOURCE_ORDER: ForecastSource[] = [
  "openmeteo_cams",
  "openweather",
  "gistda",
  "clearpath",
];

export const FORECAST_LIMITATION_LABELS: Record<string, string> = {
  external_provider_partial_horizon: "แหล่งภายนอกครอบคลุมไม่ครบทุกชั่วโมง",
  single_external_provider:
    "ช่วงนี้มีข้อมูลจากผู้ให้บริการภายนอกเพียงแหล่งเดียว",
  external_provider_unavailable: "ยังไม่มีข้อมูลพยากรณ์ภายนอกที่สด",
  external_provider_disagreement: "ผู้ให้บริการให้ค่าต่างกันมาก",
  local_fallback_only: "กำลังใช้แนวโน้มสำรองจากข้อมูลสถานี",
  local_inputs_unusable: "ข้อมูลสถานีไม่เพียงพอสำหรับวิธีสำรอง",
  provider_selection_evidence_insufficient:
    "หลักฐานความแม่นย้อนหลังยังไม่ถึงเกณฑ์ จึงเลือกจากข้อมูลที่ใหม่ที่สุดชั่วคราว",
};

export function formatProviderTime(value: string | null): string {
  const date = parseDate(value);
  if (!date) return "ไม่พบเวลา";
  return date.toLocaleString("th-TH", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatForecastTime(
  value: string | null,
  now = new Date(),
): string {
  const date = parseDate(value);
  if (!date) return "ไม่พบเวลา";
  const target = startOfDay(date);
  const today = startOfDay(now);
  const dayOffset = Math.round(
    (target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000),
  );
  if (dayOffset < 0 || dayOffset > 1) return formatProviderTime(value);
  const day = dayOffset === 0 ? "วันนี้" : "พรุ่งนี้";
  return `${day} ${date.toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
  })} น.`;
}

export function agreementLabel(data: ForecastResponse): string {
  if (data.provider_count < 2) return "ยังเปรียบเทียบไม่ได้";
  if (data.agreement === "high") return "ใกล้เคียงกัน";
  if (data.agreement === "medium") return "ต่างกันปานกลาง";
  return "ต่างกันมาก";
}

export function forecastStatus(data: ForecastResponse): string {
  if (data.forecast_status === "available" && data.agreement !== "low") {
    return "ใช้วางแผนได้";
  }
  if (data.forecast_status === "limited" || data.agreement === "low") {
    return "ความมั่นใจต่ำ";
  }
  return "ยังไม่มีพยากรณ์ที่เชื่อถือได้";
}

export function forecastIntervalHint(data: ForecastResponse): string {
  if (data.provider_count < 2) {
    return "มีข้อมูลเพียงแหล่งเดียว ควรตรวจค่าปัจจุบันร่วมด้วย";
  }
  if (data.agreement === "low") {
    return "แต่ละแหล่งให้ค่าต่างกันมาก ควรใช้ช่วงประมาณด้วยความระมัดระวัง";
  }
  if (data.agreement === "medium") {
    return "แต่ละแหล่งต่างกันปานกลาง ควรดูแนวโน้มมากกว่าตัวเลขเดียว";
  }
  return "หลายแหล่งให้ค่าใกล้กัน จึงใช้วางแผนได้มั่นใจขึ้น";
}

export function forecastMethodLabel(
  point: ForecastPoint,
  source: ForecastSource,
): string {
  if (source !== "clearpath") {
    return `ค่าดิบจาก ${FORECAST_SOURCE_LABELS[source]}`;
  }
  return point.model_version
    ? "โมเดล ClearPath ที่ผ่าน release gate"
    : "แนวโน้มสำรองจากข้อมูลสถานีล่าสุด";
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}
