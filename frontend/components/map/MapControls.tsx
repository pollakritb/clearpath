"use client";

import { useState, type CSSProperties, type SyntheticEvent } from "react";
import { useMap } from "react-leaflet";

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
  hasLocation?: boolean;
}

export default function MapControls({
  onLocate,
  hasLocation = false,
}: MapControlsProps) {
  const map = useMap();
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
            : "หาตำแหน่งไม่สำเร็จ ลองอีกครั้ง",
        );
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 0 },
    );
  };

  return (
    <div
      className="cp-mapctrls"
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
      {locationError && (
        <p className="cp-mapctrls__error" role="alert">
          {locationError}
        </p>
      )}
    </div>
  );
}
