import AppIcon from "@/frontend/components/ui/AppIcon";
import SourceBadge from "@/frontend/components/ui/SourceBadge";
import { classifyPm25 } from "@/frontend/lib/aqi";
import { estimateLocalAir, type LocalAirPoint } from "@/frontend/lib/local-air";
import type { CommunityMapPoint, Station } from "@/frontend/types";
import type {
  CurrentLocation,
  CurrentLocationStatus,
} from "@/frontend/hooks/useCurrentLocation";

interface MobileAirSummaryProps {
  stations: Station[];
  communityPoints: CommunityMapPoint[];
  updatedAt: string | null;
  loading: boolean;
  location: CurrentLocation | null;
  locationStatus: CurrentLocationStatus;
  onRequestLocation: () => void;
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
  communityPoints,
  updatedAt,
  loading,
  location,
  locationStatus,
  onRequestLocation,
  onOpenMap,
  onOpenReport,
}: MobileAirSummaryProps) {
  const points: LocalAirPoint[] = [
    ...stations.flatMap((station): LocalAirPoint[] =>
      station.pm25 == null || !station.eligible_for_surface
        ? []
        : [
            {
              lat: station.lat,
              lon: station.lon,
              pm25: station.pm25,
              source: "official",
              name: station.name_th || station.name_en || station.id,
            },
          ],
    ),
    ...communityPoints.map((point): LocalAirPoint => ({
      lat: point.lat,
      lon: point.lon,
      pm25: point.pm25,
      source: "community",
      name: "จุดข้อมูลชุมชนที่ผ่านเกณฑ์",
    })),
  ];
  const estimate = location
    ? estimateLocalAir(location.lat, location.lon, points)
    : null;
  const classification = classifyPm25(estimate?.pm25);
  const isLocating = locationStatus === "idle" || locationStatus === "locating";
  const needsLocation =
    locationStatus === "denied" || locationStatus === "unavailable";

  const statusCopy = isLocating
    ? "กำลังหาตำแหน่ง GPS…"
    : needsLocation
      ? "ต้องใช้ตำแหน่งเพื่อแสดงค่าฝุ่นใกล้คุณ"
      : loading
        ? "กำลังโหลดจุดวัดใกล้ตำแหน่งคุณ…"
        : estimate
          ? estimate.basis === "idw"
            ? `ประมาณจาก ${estimate.contributorCount} จุดวัดใกล้เคียง`
            : `อ้างอิงจุดวัดใกล้สุด ${estimate.nearestDistanceKm} กม.`
          : "ยังไม่มีจุดวัดที่พร้อมใช้ภายใน 30 กม.";

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
            ฝุ่นใกล้ตำแหน่งคุณ
          </span>
          <small>{loading ? "กำลังอัปเดต…" : formatTime(updatedAt)}</small>
        </div>

        <div className="cp-mobile-air-card__reading">
          <div className="cp-mobile-air-card__number">
            <strong>{estimate?.pm25 ?? "—"}</strong>
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

        <p aria-live="polite">
          {estimate ? classification.advice : statusCopy}
        </p>

        {estimate && location ? (
          <div className="cp-mobile-air-card__location">
            <span>
              <AppIcon name="location" size={16} />
              GPS คลาดเคลื่อนประมาณ {Math.round(location.accuracy)} ม.
            </span>
            <button
              type="button"
              className="cp-focus"
              onClick={onRequestLocation}
            >
              อัปเดต
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="cp-mobile-air-card__locate cp-focus"
            onClick={onRequestLocation}
            disabled={isLocating}
          >
            <AppIcon name="location" size={17} />
            {isLocating ? "กำลังค้นหา GPS…" : "ใช้ตำแหน่งปัจจุบัน"}
          </button>
        )}

        {estimate && (
          <div className="cp-mobile-air-card__source">
            {estimate.officialCount > 0 && (
              <span className="cp-mobile-air-card__source-group">
                <SourceBadge kind="official" compact />
                <small>{estimate.officialCount} จุด</small>
              </span>
            )}
            {estimate.communityCount > 0 && (
              <span className="cp-mobile-air-card__community-source">
                <AppIcon name="community" size={14} />
                ชุมชนผ่านเกณฑ์ {estimate.communityCount} จุด
              </span>
            )}
          </div>
        )}
        <small className="cp-mobile-air-card__scope">
          {estimate
            ? estimate.basis === "idw"
              ? `คำนวณบนอุปกรณ์ · ${statusCopy} · จุดใกล้สุด ${estimate.nearestDistanceKm} กม.`
              : `คำนวณบนอุปกรณ์ · ${statusCopy} (${estimate.nearestName})`
            : "GPS ใช้คำนวณบนอุปกรณ์ และไม่ใช้ค่าเฉลี่ยทั้งประเทศแทนตำแหน่งของคุณ"}
        </small>
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
