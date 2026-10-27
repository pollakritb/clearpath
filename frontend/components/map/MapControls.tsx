"use client";

import { useState, type CSSProperties, type SyntheticEvent } from "react";
import { useMap, useMapEvents } from "react-leaflet";

import AppIcon from "@/frontend/components/ui/AppIcon";
import { T } from "@/frontend/lib/ui";

const CONTROL_BUTTON_STYLE: CSSProperties = {
  width: "2.7em",
  height: "2.7em",
  border: "none",
  background: "transparent",
  cursor: "pointer",
  fontSize: "1.3em",
  color: T.ink,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

interface MapControlsProps {
  onLocate?: (lat: number, lon: number, accuracy?: number) => void;
  onResetView?: () => void;
  hasLocation?: boolean;
  locationUnavailable?: boolean;
}

export default function MapControls({
  onLocate,
  onResetView,
  hasLocation = false,
  locationUnavailable = false,
}: MapControlsProps) {
  const map = useMap();
  const [zoom, setZoom] = useState(() => map.getZoom());
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) });
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const stopPropagation = (event: SyntheticEvent) => event.stopPropagation();
  const locate = () => {
    if (!navigator.geolocation) {
      setLocationError("อุปกรณ์นี้ไม่รองรับการระบุตำแหน่ง");
      return;
    }
    setLocating(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        setLocating(false);
        map.flyTo([latitude, longitude], Math.max(map.getZoom(), 15));
        onLocate?.(latitude, longitude, accuracy);
      },
      (error) => {
        setLocating(false);
        setLocationError(
          error.code === error.PERMISSION_DENIED
            ? "อนุญาตการเข้าถึงตำแหน่งในเบราว์เซอร์ก่อนใช้งาน"
            : error.code === error.POSITION_UNAVAILABLE
              ? "ระบบหาตำแหน่งไม่ได้ ตรวจบริการตำแหน่งและ Wi-Fi ของเครื่อง แล้วลองอีกครั้ง"
              : "หาตำแหน่งไม่ทัน ลองอีกครั้ง",
        );
      },
      { enableHighAccuracy: false, timeout: 20_000, maximumAge: 5 * 60_000 },
    );
  };

  return (
    <div
      className="cp-mapctrls"
      role="group"
      aria-label={`ควบคุมแผนที่ ระดับซูม ${zoom}`}
      data-zoom={zoom}
      onMouseDown={stopPropagation}
      onDoubleClick={stopPropagation}
    >
      <div
        className="cp-mapctrls__zoom"
        style={{
          display: "flex",
          flexDirection: "column",
          background: T.panel,
          borderRadius: "11px",
          boxShadow: "0 3px 12px rgba(0,0,0,.2)",
          overflow: "hidden",
          border: `1px solid ${T.line}`,
        }}
      >
        <button
          type="button"
          aria-label="ซูมเข้า"
          className="cp-focus"
          onClick={() => map.zoomIn()}
          style={CONTROL_BUTTON_STYLE}
        >
          +
        </button>
        <button
          type="button"
          aria-label="ซูมออก"
          className="cp-focus"
          onClick={() => map.zoomOut()}
          style={{ ...CONTROL_BUTTON_STYLE, borderTop: `1px solid ${T.line}` }}
        >
          −
        </button>
      </div>
      {onResetView && (
        <button
          type="button"
          aria-label="กลับมุมมองแผนที่กว้าง"
          className="cp-mapctrls__overview cp-focus"
          onClick={onResetView}
          title="กลับไปดูแผนที่ประเทศไทย"
        >
          <AppIcon name="map" size={19} />
          <span>มุมกว้าง</span>
        </button>
      )}
      <button
        type="button"
        aria-label="ตำแหน่งของฉัน"
        className="cp-mapctrls__locate cp-focus"
        onClick={locate}
        title="ไปที่ตำแหน่งของฉัน"
        data-active={hasLocation}
        aria-busy={locating}
        disabled={locating}
      >
        <span className="cp-mapctrls__locate-icon" aria-hidden="true">
          <AppIcon name="locate" size={19} />
        </span>
        <span>{locating ? "กำลังหาตำแหน่ง" : "ไปตำแหน่งฉัน"}</span>
      </button>
      {(locationError || locationUnavailable) && (
        <p
          className="cp-mapctrls__error"
          role={locationError ? "alert" : "status"}
        >
          {locationError ?? "GPS ไม่พร้อม แตะแผนที่หรือค้นหาสถานที่แทนได้"}
        </p>
      )}
    </div>
  );
}
