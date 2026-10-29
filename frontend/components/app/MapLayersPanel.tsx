import Link from "next/link";

import AppIcon from "@/frontend/components/ui/AppIcon";
import { AQI_LEGEND } from "@/frontend/lib/aqi";
import type { FirmsLoadStatus } from "@/frontend/hooks/useFirms";

import type { ViewMode } from "@/frontend/types/ui";

interface MapLayersPanelProps {
  viewMode: ViewMode;
  stationCount: number;
  individualReportCount: number;
  fireCount: number;
  fireStatus: FirmsLoadStatus;
  showHeatmap: boolean;
  heatmapDistanceKm: number | null;
  heatmapStatus:
    | "ready"
    | "no_data"
    | "no_location"
    | "location_denied"
    | "location_unavailable";
  showStations: boolean;
  showIndividualReports: boolean;
  showFires: boolean;
  onClose: () => void;
  onViewModeChange: (mode: ViewMode) => void;
  onToggleHeatmap: () => void;
  onToggleStations: () => void;
  onToggleIndividualReports: () => void;
  onToggleFires: () => void;
}

export default function MapLayersPanel({
  viewMode,
  stationCount,
  individualReportCount,
  fireCount,
  fireStatus,
  showHeatmap,
  heatmapDistanceKm,
  heatmapStatus,
  showStations,
  showIndividualReports,
  showFires,
  onClose,
  onViewModeChange,
  onToggleHeatmap,
  onToggleStations,
  onToggleIndividualReports,
  onToggleFires,
}: MapLayersPanelProps) {
  const distanceLabel =
    heatmapDistanceKm == null
      ? null
      : heatmapDistanceKm < 0.1
        ? "น้อยกว่า 0.1 กม."
        : `${heatmapDistanceKm.toFixed(1)} กม.`;

  return (
    <section
      id="cp-map-layers-panel"
      className="cp-map-flyout cp-map-layers-panel"
      aria-label="เลือกข้อมูลที่แสดงบนแผนที่"
    >
      <div className="cp-map-flyout__heading">
        <div>
          <strong>ข้อมูลบนแผนที่</strong>
        </div>
        <button
          type="button"
          className="cp-map-flyout__close cp-focus"
          onClick={onClose}
          aria-label="ปิดตัวเลือกข้อมูล"
        >
          <AppIcon name="close" size={20} />
        </button>
      </div>

      <div className="cp-map-layer-list">
        <LayerButton
          active={showStations}
          icon="station"
          symbolClass="cp-layer-symbol--station"
          title="สถานีตรวจวัดทางการ"
          description={`Air4Thai · ${stationCount} สถานี`}
          onClick={onToggleStations}
        />
        <LayerButton
          active={showIndividualReports}
          icon="user"
          iconSize={20}
          symbolClass="cp-layer-symbol--individual"
          title="รายงานจากชุมชน"
          description={`${individualReportCount} รายงาน · ภาพเครื่องวัดพร้อม GPS`}
          onClick={onToggleIndividualReports}
        />
        <LayerButton
          active={showHeatmap}
          icon="activity"
          symbolClass="cp-layer-symbol--surface"
          title="ค่าฝุ่นจุดใกล้สุด"
          description={
            heatmapStatus === "location_denied"
              ? "เปิด GPS เพื่อแสดงจุดใกล้คุณที่สุด"
              : heatmapStatus === "location_unavailable"
                ? "เปิด GPS เพื่อแสดงจุดใกล้คุณที่สุด"
                : heatmapStatus === "no_location"
                  ? "เปิด GPS เพื่อแสดงจุดใกล้คุณที่สุด"
                  : heatmapStatus === "no_data"
                    ? "ยังไม่มีจุดข้อมูลบนแผนที่"
                    : `ห่างจากคุณ ${distanceLabel}`
          }
          onClick={onToggleHeatmap}
        />
        <LayerButton
          active={showFires}
          icon="satellite"
          symbolClass="cp-layer-symbol--fire"
          title="จุดความร้อนดาวเทียม"
          description={`NASA FIRMS · ${fireStatusLabel(fireStatus, fireCount)}`}
          onClick={onToggleFires}
        />
      </div>

      <details
        className="cp-layer-legend"
        aria-labelledby="cp-layer-legend-title"
      >
        <summary className="cp-layer-legend__heading cp-focus">
          <strong id="cp-layer-legend-title">สีระดับ PM2.5</strong>
          <span>
            µg/m³ <AppIcon name="chevron" size={16} />
          </span>
        </summary>
        <div className="cp-layer-legend__items">
          {AQI_LEGEND.map((item) => (
            <div key={item.range} className="cp-layer-legend__item">
              <i aria-hidden="true" style={{ background: item.color }} />
              <span>{item.level}</span>
              <b>{item.range}</b>
            </div>
          ))}
        </div>
        <p className="cp-map-layer-note">
          วงสีใช้ค่าปัจจุบันจากจุดตรวจที่ใกล้ GPS คุณที่สุด 1 จุด
          จากสถานีทางการและรายงานชุมชน โดยเทียบระยะห่างเท่านั้น รัศมี 12 กม.
          เป็นขอบเขตการแสดงผล
        </p>
      </details>

      <div className="cp-map-layer-actions">
        <Link href="/requests" className="cp-measure-layer-entry cp-focus">
          <AppIcon name="community" size={19} />
          ขอค่าฝุ่นจากชุมชน
        </Link>
        <button
          type="button"
          className="cp-focus"
          onClick={() => {
            onViewModeChange(viewMode === "map" ? "list" : "map");
            onClose();
          }}
        >
          <AppIcon name={viewMode === "map" ? "menu" : "map"} size={19} />
          {viewMode === "map" ? "ดูรายการสถานี" : "กลับไปแผนที่"}
        </button>
        <Link href="/settings" className="cp-focus">
          <AppIcon name="settings" size={19} />
          การตั้งค่า
        </Link>
      </div>
    </section>
  );
}

function fireStatusLabel(status: FirmsLoadStatus, count: number) {
  if (status === "available") return `${count} จุด อายุไม่เกิน 12 ชม.`;
  if (status === "checked_no_hotspots") return "ตรวจแล้วไม่พบใน 12 ชม.";
  if (status === "stale") return "มีเฉพาะข้อมูลเก่ากว่า 12 ชม.";
  if (status === "unconfigured") return "ยังไม่ได้เชื่อมแหล่งข้อมูล";
  if (status === "unavailable") return "แหล่งข้อมูลขัดข้องชั่วคราว";
  if (status === "failed") return "โหลดข้อมูลไม่สำเร็จ";
  return "แตะเพื่อเปิดและตรวจข้อมูล";
}

function LayerButton({
  active,
  icon,
  iconSize = 18,
  symbolClass,
  title,
  description,
  onClick,
}: {
  active: boolean;
  icon?: Parameters<typeof AppIcon>[0]["name"];
  iconSize?: number;
  symbolClass: string;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="cp-map-layer cp-focus"
      data-active={active}
      role="switch"
      aria-checked={active}
      onClick={onClick}
    >
      <span aria-hidden="true" className={`cp-layer-symbol ${symbolClass}`}>
        {icon && <AppIcon name={icon} size={iconSize} />}
      </span>
      <span>
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
      <span className="cp-layer-switch" aria-hidden />
    </button>
  );
}
