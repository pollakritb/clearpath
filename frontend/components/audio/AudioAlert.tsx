"use client";

import { useSpeech } from "@/frontend/hooks/useSpeech";
import type { RouteCompareResponse } from "@/frontend/types";

function buildSummary(data: RouteCompareResponse): string {
  const best = data.routes.find((r) => r.id === data.recommended_id);
  if (!best) return "ไม่พบเส้นทางที่แนะนำ";
  return (
    `เส้นทางที่แนะนำคือ ${best.label} ` +
    `ค่าฝุ่น PM 2.5 เฉลี่ย ${best.avg_pm25} ไมโครกรัมต่อลูกบาศก์เมตร ` +
    `ระดับ ${best.level ?? "ไม่ทราบ"} ` +
    `ระยะทาง ${best.distance_km} กิโลเมตร ` +
    `ใช้เวลาประมาณ ${Math.round(best.duration_min)} นาที`
  );
}

export default function AudioAlert({ data }: { data: RouteCompareResponse }) {
  const { supported, speaking, speak, cancel } = useSpeech();

  if (!supported) {
    return (
      <p className="text-xs text-gray-400">
        เบราว์เซอร์นี้ไม่รองรับการอ่านออกเสียง (Web Speech API)
      </p>
    );
  }

  return (
    <button
      type="button"
      onClick={() => (speaking ? cancel() : speak(buildSummary(data)))}
      className="flex w-full items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 transition hover:bg-blue-100"
      aria-label="อ่านสรุปผลออกเสียง"
    >
      {speaking ? "⏹ หยุดอ่าน" : "🔊 อ่านผลออกเสียง"}
    </button>
  );
}
