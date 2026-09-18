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
  bigText: boolean;
  showHeatmap: boolean;
  showStations: boolean;
  showIndividualReports: boolean;
  showFires: boolean;
  onClose: () => void;
  onViewModeChange: (mode: ViewMode) => void;
  onToggleBigText: () => void;
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
  bigText,
  showHeatmap,
  showStations,
  showIndividualReports,
  showFires,
  onClose,
  onViewModeChange,
  onToggleBigText,
  onToggleHeatmap,
  onToggleStations,
  onToggleIndividualReports,
  onToggleFires,
}: MapLayersPanelProps) {
  return (
    <section
      id="cp-map-layers-panel"
      className="cp-map-flyout cp-map-layers-panel"
      aria-label="เลือกข้อมูลที่แสดงบนแผนที่"
    >
      <div className="cp-map-flyout__heading">
        <div>
          <strong>ข้อมูลบนแผนที่</strong>
          <small>สัญลักษณ์แต่ละแบบมาจากคนละแหล่ง</small>
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
          iconSize={15}
          symbolClass="cp-layer-symbol--individual"
          title="รายงานจากบุคคล"
          description={`ภาพเครื่องวัดพร้อม GPS · ${individualReportCount} รายงาน`}
          onClick={onToggleIndividualReports}
        />
        <LayerButton
          active={showHeatmap}
          symbolClass="cp-layer-symbol--surface"
          title="พื้นผิวค่าฝุ่น"
          description="คำนวณจากข้อมูลที่ผ่านเกณฑ์"
          onClick={onToggleHeatmap}
        />
        <LayerButton
          active={showFires}
          icon="satellite"
          symbolClass="cp-layer-symbol--fire"
          title="จุดความร้อนจากดาวเทียม"
          description={`NASA FIRMS · ${fireStatusLabel(fireStatus, fireCount)}`}
          onClick={onToggleFires}
        />
      </div>

      <div className="cp-map-aqi-legend" aria-label="สีระดับ PM2.5 ห้าระดับ">
        {AQI_LEGEND.map((item) => (
          <span
            key={item.range}
            role="img"
            aria-label={`${item.level} ${item.range}`}
          >
            <i aria-hidden style={{ background: item.color }} />
            <b aria-hidden>{item.range}</b>
          </span>
        ))}
      </div>

      <div className="cp-map-layer-actions">
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
        <button
          type="button"
          className="cp-focus"
          data-active={bigText}
          aria-pressed={bigText}
          onClick={onToggleBigText}
        >
          <span aria-hidden>ก</span>
          ตัวอักษรใหญ่
        </button>
        <Link href="/settings" className="cp-focus">
          <AppIcon name="settings" size={19} />
          การตั้งค่า
        </Link>
      </div>
      <p className="cp-map-layer-note">
        สีหมุดบอกระดับ PM2.5 ทั้ง 5 ระดับ · รูปทรงและไอคอนบอกเจ้าของข้อมูล
      </p>
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
      aria-pressed={active}
      onClick={onClick}
    >
      <span className={`cp-layer-symbol ${symbolClass}`}>
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
