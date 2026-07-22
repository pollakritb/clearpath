"use client";

import type { CSSProperties, SyntheticEvent } from "react";
import { useMap } from "react-leaflet";

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
}

export default function MapControls({ onLocate }: MapControlsProps) {
  const map = useMap();

  const stopPropagation = (event: SyntheticEvent) => event.stopPropagation();
  const locate = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((position) => {
      const { latitude, longitude, accuracy } = position.coords;
      map.flyTo([latitude, longitude], 13);
      onLocate?.(latitude, longitude, accuracy);
    });
  };

  return (
    <div
      className="cp-mapctrls"
      onMouseDown={stopPropagation}
      onDoubleClick={stopPropagation}
    >
      <div
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
        className="cp-focus"
        onClick={locate}
        style={{
          width: "2.9em",
          height: "2.9em",
          border: `1px solid ${T.line}`,
          background: T.panel,
          borderRadius: "50%",
          boxShadow: "0 3px 12px rgba(0,0,0,.2)",
          cursor: "pointer",
          fontSize: "1.2em",
          color: T.teal,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        ◎
      </button>
    </div>
  );
}
