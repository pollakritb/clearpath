import { useEffect, useRef } from "react";
import styles from "./MapLayersPanel.module.css";

import AppIcon from "@/frontend/components/ui/AppIcon";
import { AQI_LEGEND, FORECAST_LEGEND } from "@/frontend/lib/aqi";
import type { FirmsLoadStatus } from "@/frontend/hooks/useFirms";

import type { ViewMode } from "@/frontend/types/ui";

interface MapLayersPanelProps {
  camsEnabled?: boolean;
  onToggleCams?: () => void;
  viewMode: ViewMode;
  stationCount: number;
  individualReportCount: number;
  fireCount: number;
  fireStatus: FirmsLoadStatus;
  showStations: boolean;
  showIndividualReports: boolean;
  showFires: boolean;
  onClose: () => void;
  onViewModeChange: (mode: ViewMode) => void;
  onToggleStations: () => void;
  onToggleIndividualReports: () => void;
  onToggleFires: () => void;
}

export default function MapLayersPanel({
  camsEnabled = false,
  onToggleCams,
  viewMode,
  stationCount,
  individualReportCount,
  fireCount,
  fireStatus,
  showStations,
  showIndividualReports,
  showFires,
  onClose,
  onViewModeChange,
  onToggleStations,
  onToggleIndividualReports,
  onToggleFires,
}: MapLayersPanelProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const trigger =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    dialog.current?.showModal();
    return () => {
      if (trigger?.isConnected) trigger.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      id="cp-map-layers-panel"
      className={styles.popup}
      aria-labelledby="cp-layer-popup-title"
      onKeyDown={(e) => {
        if (e.key !== "Tab") return;
        const controls = [
          ...e.currentTarget.querySelectorAll<HTMLElement>(
            "button:not(:disabled), a[href], summary, input:not(:disabled), [tabindex='0']",
          ),
        ].filter((element) => element.getClientRects().length > 0);
        const first = controls[0],
          last = controls.at(-1);
        if (
          first &&
          last &&
          ((e.shiftKey && document.activeElement === first) ||
            (!e.shiftKey && document.activeElement === last))
        ) {
          e.preventDefault();
          (e.shiftKey ? last : first).focus();
        }
      }}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === dialog.current) {
          const r = dialog.current.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            onClose();
        }
      }}
    >
      <header className={styles.heading}>
        <h2 id="cp-layer-popup-title">ข้อมูลบนแผนที่</h2>
        <button type="button" onClick={onClose} aria-label="ปิดตัวเลือกข้อมูล">
          <AppIcon name="close" size={22} />
        </button>
      </header>
      {camsEnabled && (
        <p className="cp-cams-mode-note">
          กำลังแสดงพยากรณ์ CAMS · พักชั้นค่าตรวจวัดชั่วคราว
        </p>
      )}
      {onToggleCams && (
        <div className="cp-map-layer-list">
          <LayerButton
            active={camsEnabled}
            icon="clock"
            symbolClass="cp-layer-symbol--surface"
            title="พยากรณ์ PM2.5"
            description="CAMS · ภาพรวมระดับพื้นที่"
            onClick={onToggleCams}
          />
        </div>
      )}
      <fieldset className="cp-cams-observation-layers" disabled={camsEnabled}>
        <legend className="sr-only">ชั้นค่าตรวจวัด</legend>
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
            active={showFires}
            icon="satellite"
            symbolClass="cp-layer-symbol--fire"
            title="จุดความร้อนจากดาวเทียม"
            description={`NASA FIRMS · ${fireStatusLabel(fireStatus, fireCount)}`}
            onClick={onToggleFires}
          />
        </div>
      </fieldset>
      {showFires && (
        <p className="cp-map-layer-note">
          <AppIcon name="satellite" size={18} />{" "}
          หมุดสีส้มคือจุดความร้อนจากดาวเทียม ตัวเลขบนหมุดกลุ่มคือจำนวนจุดตรวจพบ
          ไม่ใช่ค่า PM2.5 หรือจำนวนเหตุไฟไหม้ แตะกลุ่มเพื่อขยายแผนที่
        </p>
      )}
      <details
        className="cp-layer-legend"
        aria-labelledby="cp-layer-legend-title"
      >
        <summary className="cp-layer-legend__heading cp-focus">
          <strong id="cp-layer-legend-title">สีและสัญลักษณ์ PM2.5</strong>
          <span>
            µg/m³ <AppIcon name="chevron" size={16} />
          </span>
        </summary>
        <p className="cp-map-layer-note">
          {camsEnabled
            ? "สีพยากรณ์ CAMS ใช้ 6 ระดับตามช่วงความเข้มข้น PM2.5 แยกจากสีค่าตรวจวัด"
            : "รูปสถานีคือข้อมูล Air4Thai รูปคนคือรายงานชุมชน หมุดซ้อนแสดงค่าเฉลี่ยของจุดในกลุ่ม ป้ายมุมบนบอกจำนวนจุด และนาฬิกาบอกข้อมูลเก่า แตะเพื่อขยายดูค่าของแต่ละหมุด ตัวเลขกลุ่มไม่ใช่ค่าประมาณของพื้นที่ทั้งหมด"}
        </p>
        <div className="cp-layer-legend__items">
          {(camsEnabled ? FORECAST_LEGEND : AQI_LEGEND).map((item) => (
            <div key={item.range} className="cp-layer-legend__item">
              <i aria-hidden="true" style={{ background: item.color }} />
              <span>{item.level}</span>
              <b>{item.range}</b>
            </div>
          ))}
        </div>
        <p className="cp-map-layer-note">
          {camsEnabled
            ? "พยากรณ์ CAMS เป็นภาพรวมจากกริดประมาณ 45 กม. ไม่ใช่ค่าตรวจวัด ณ จุดนั้น"
            : "วงสีใช้ค่าล่าสุดที่มีของจุดตรวจใกล้ GPS คุณที่สุด 1 จุด จากชั้นข้อมูลที่เปิดอยู่ โดยไม่ใช้รายงานของคุณ อาจเป็นข้อมูลเก่า โปรดตรวจเวลาที่วัด รัศมี 12 กม. เป็นขอบเขตการแสดงผล ไม่ใช่ค่าเฉลี่ยของพื้นที่"}
        </p>
      </details>

      <div className="cp-map-layer-actions">
        <button
          disabled={camsEnabled}
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
      </div>
    </dialog>
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
