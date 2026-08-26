import AppIcon from "@/frontend/components/ui/AppIcon";
import SourceBadge from "@/frontend/components/ui/SourceBadge";
import { classifyPm25 } from "@/frontend/lib/aqi";
import type { Station } from "@/frontend/types";

interface MobileAirSummaryProps {
  stations: Station[];
  updatedAt: string | null;
  loading: boolean;
  onOpenMap: () => void;
  onOpenReport: () => void;
}

function formatTime(value: string | null) {
  if (!value) return "รออัปเดต";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "รออัปเดต";
  return `อัปเดต ${date.toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
  })} น.`;
}

export default function MobileAirSummary({
  stations,
  updatedAt,
  loading,
  onOpenMap,
  onOpenReport,
}: MobileAirSummaryProps) {
  const currentValues = stations.flatMap((station) =>
    station.pm25 == null || !station.eligible_for_surface ? [] : [station.pm25],
  );
  const latestValues = stations.flatMap((station) =>
    station.pm25 == null ? [] : [station.pm25],
  );
  const referenceOnly = !currentValues.length && latestValues.length > 0;
  const values = currentValues.length ? currentValues : latestValues;
  const average = values.length
    ? Math.round(
        (values.reduce((sum, value) => sum + value, 0) / values.length) * 10,
      ) / 10
    : null;
  const classification = classifyPm25(average);

  return (
    <section className="cp-mobile-home" aria-label="ภาพรวมอากาศวันนี้">
      <div
        className="cp-mobile-air-card"
        style={
          {
            "--cp-air-tone": classification.color,
            "--cp-air-tint": classification.tint,
          } as React.CSSProperties
        }
      >
        <div className="cp-mobile-air-card__topline">
          <span>
            <AppIcon name="activity" size={18} />
            {referenceOnly
              ? "ค่าเฉลี่ยจากข้อมูลล่าสุด"
              : "ค่าเฉลี่ย PM2.5 ทั่วประเทศ"}
          </span>
          <small>{loading ? "กำลังอัปเดต…" : formatTime(updatedAt)}</small>
        </div>

        <div className="cp-mobile-air-card__reading">
          <div className="cp-mobile-air-card__number">
            <strong>{average ?? "—"}</strong>
            <span>µg/m³</span>
          </div>
          <div className="cp-mobile-air-card__level">
            <span aria-hidden>{classification.glyph}</span>
            <div>
              <small>คุณภาพอากาศ</small>
              <strong>{classification.level}</strong>
            </div>
          </div>
        </div>

        <p>
          {referenceOnly
            ? "ข้อมูลเกิน 1 ชั่วโมง แสดงเพื่ออ้างอิงและไม่นำไปสร้างพื้นผิวค่าฝุ่น"
            : classification.advice}
        </p>
        <div className="cp-mobile-air-card__source">
          <SourceBadge kind="official" compact />
          <span>
            Air4Thai · {values.length} สถานี
            {referenceOnly ? " · ยังไม่มีสถานีสดใหม่" : "ที่พร้อมใช้งาน"}
          </span>
        </div>
      </div>

      <div className="cp-mobile-quick-actions" aria-label="ทางลัด">
        <button type="button" onClick={onOpenMap} className="cp-focus">
          <span className="cp-mobile-quick-actions__icon">
            <AppIcon name="map" size={22} />
          </span>
          <span>
            <strong>ดูแผนที่ใกล้ฉัน</strong>
            <small>ค้นหาสถานีและค่ารายพื้นที่</small>
          </span>
          <AppIcon name="chevron" size={18} />
        </button>
        <button type="button" onClick={onOpenReport} className="cp-focus">
          <span className="cp-mobile-quick-actions__icon">
            <AppIcon name="report" size={22} />
          </span>
          <span>
            <strong>ช่วยส่งข้อมูล</strong>
            <small>ถ่ายเครื่องวัด ใช้เวลาไม่กี่นาที</small>
          </span>
          <AppIcon name="chevron" size={18} />
        </button>
      </div>
    </section>
  );
}
