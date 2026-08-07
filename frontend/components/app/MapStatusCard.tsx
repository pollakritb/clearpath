import Link from "next/link";

import AppIcon from "@/frontend/components/ui/AppIcon";
import { classifyPm25 } from "@/frontend/lib/aqi";
import type { Station } from "@/frontend/types";

interface MapStatusCardProps {
  stations: Station[];
  forecastStations: Station[];
  station: Station | null;
  updatedAt: string | null;
  horizon: 0 | 1 | 3 | 6 | 12 | 24;
  forecastLoading: boolean;
  forecastError: string | null;
  forecastWarnings: string[];
  onHorizonChange: (horizon: 0 | 1 | 3 | 6 | 12 | 24) => void;
}

function averagePm25(stations: Station[], eligibleOnly: boolean) {
  const values = stations.flatMap((station) =>
    station.pm25 == null || (eligibleOnly && !station.eligible_for_surface)
      ? []
      : [station.pm25],
  );
  if (!values.length) return null;
  return (
    Math.round(
      (values.reduce((sum, value) => sum + value, 0) / values.length) * 10,
    ) / 10
  );
}

function formatUpdatedAt(value: string | null) {
  if (!value) return "รออัปเดตข้อมูล";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "รออัปเดตข้อมูล";
  return `อัปเดต ${date.toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
  })} น.`;
}

export default function MapStatusCard({
  stations,
  forecastStations,
  station,
  updatedAt,
  horizon,
  forecastLoading,
  forecastError,
  forecastWarnings,
  onHorizonChange,
}: MapStatusCardProps) {
  const currentAverage = averagePm25(stations, true);
  const latestAverage = averagePm25(stations, false);
  const forecastAverage = averagePm25(forecastStations, false);
  const isForecast = horizon > 0;
  const value = isForecast
    ? forecastAverage
    : (station?.pm25 ?? currentAverage ?? latestAverage);
  const referenceOnly = station
    ? !station.eligible_for_surface
    : currentAverage == null && latestAverage != null;
  const classification = classifyPm25(value);
  const name = isForecast
    ? `พยากรณ์พื้นที่ที่กำลังดู อีก ${horizon} ชั่วโมง`
    : station
      ? (station.name_th ?? station.name_en ?? station.id)
      : "ภาพรวมประเทศไทย";
  const href =
    !isForecast && station
      ? `/air?station=${encodeURIComponent(station.id)}`
      : "/air";

  return (
    <section
      className="cp-map-status-card"
      style={
        {
          "--cp-map-status": classification.color,
          "--cp-map-status-tint": classification.tint,
        } as React.CSSProperties
      }
      aria-label="สถานะคุณภาพอากาศบนแผนที่"
    >
      <div
        className="cp-map-horizon"
        role="group"
        aria-label="ช่วงเวลาบนแผนที่"
      >
        {([0, 1, 3, 6, 12, 24] as const).map((item) => (
          <button
            key={item}
            type="button"
            className="cp-focus"
            aria-pressed={horizon === item}
            data-active={horizon === item}
            onClick={() => onHorizonChange(item)}
          >
            {item === 0 ? "ตอนนี้" : `+${item}ชม.`}
          </button>
        ))}
      </div>
      <div className="cp-map-status-card__heading">
        <div>
          <span>
            {isForecast
              ? "พื้นผิวพยากรณ์ · หลายแหล่งข้อมูล"
              : referenceOnly
                ? "ข้อมูลล่าสุด · ใช้อ้างอิงเท่านั้น"
                : station
                  ? "สถานีที่เลือก"
                  : "อากาศใกล้คุณ"}
          </span>
          <h1>{name}</h1>
        </div>
        <small>
          {isForecast
            ? forecastLoading
              ? "กำลังคำนวณ"
              : "แนวโน้ม"
            : formatUpdatedAt(updatedAt)}
        </small>
      </div>

      {forecastError && isForecast && (
        <div className="cp-map-horizon__notice" role="alert">
          {forecastError}
        </div>
      )}
      <div className="cp-map-status-card__reading">
        <div>
          <strong>{value ?? "—"}</strong>
          <span>µg/m³ PM2.5</span>
        </div>
        <div className="cp-map-status-card__level">
          <span aria-hidden>{classification.glyph}</span>
          <strong>{classification.level}</strong>
        </div>
      </div>

      <p>
        {isForecast && forecastLoading
          ? "กำลังสร้างพื้นผิวจากคำพยากรณ์รายสถานี…"
          : isForecast && forecastWarnings.length
            ? "บางพื้นที่มีสถานีน้อย ระบบจึงซ่อนจุดที่ความครอบคลุมไม่เพียงพอ"
            : isForecast
              ? "ค่ากลางของพื้นผิวพยากรณ์ พร้อม mask พื้นที่ข้อมูลไม่เพียงพอ"
              : referenceOnly
                ? "ข้อมูลเกิน 1 ชั่วโมง จึงยังไม่ใช้สร้างพื้นผิวค่าฝุ่น"
                : classification.advice}
      </p>
      <Link href={href} className="cp-map-status-card__action cp-focus">
        <span>
          {isForecast
            ? "ดูพยากรณ์รายสถานี"
            : station
              ? "ดูรายละเอียดสถานี"
              : "ดูพยากรณ์วันนี้"}
        </span>
        <AppIcon name="chevron" size={19} />
      </Link>
    </section>
  );
}
