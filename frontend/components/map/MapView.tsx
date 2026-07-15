"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect } from "react";
import { MapContainer, Marker, TileLayer, useMap } from "react-leaflet";

import {
  DEFAULT_ZOOM,
  OSM_ATTRIBUTION,
  OSM_TILE_URL,
  THAILAND_CENTER,
} from "@/frontend/lib/constants";
import { T } from "@/frontend/lib/ui";
import type {
  Coordinate,
  FirePoint,
  RouteCompareResponse,
  Station,
} from "@/frontend/types";

import ClickHandler from "./ClickHandler";
import FireLayer from "./FireLayer";
import IdwSurface from "./IdwSurface";
import RouteLayer from "./RouteLayer";
import StationMarkers from "./StationMarkers";

export interface MapViewProps {
  stations: Station[];
  routeData: RouteCompareResponse | null;
  fires: FirePoint[];
  startPin: Coordinate | null;
  endPin: Coordinate | null;
  showHeatmap: boolean;
  showStations: boolean;
  hoveredRouteId?: string | null;
  selectedRouteId?: string | null;
  onMapClick: (lat: number, lon: number) => void;
  onSelectStation: (s: Station) => void;
  onLocate?: (lat: number, lon: number) => void;
}

// หมุดทรงหยดน้ำแบบ Google Maps (A เขียว / B แดง)
function pinIcon(letter: string, color: string) {
  return L.divIcon({
    className: "cp-marker",
    html: `<div style="width:28px;height:28px;border-radius:50% 50% 50% 0;background:${color};transform:rotate(-45deg);box-shadow:0 3px 8px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;border:2px solid #fff"><span style="transform:rotate(45deg);color:#fff;font-weight:800;font-size:13px">${letter}</span></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -26],
  });
}

const ctrlBtn: React.CSSProperties = {
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

// ให้ Leaflet คำนวณขนาดใหม่เมื่อคอนเทนเนอร์เปลี่ยน (resize หน้าต่าง / sheet ขยาย)
// กันปัญหา tile ไม่เต็ม / เทาบางส่วนในเลย์เอาต์แบบ flex
function AutoResize() {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el);
    const t = setTimeout(() => map.invalidateSize(), 200);
    return () => {
      ro.disconnect();
      clearTimeout(t);
    };
  }, [map]);
  return null;
}

function MapControls({ onLocate }: { onLocate?: (lat: number, lon: number) => void }) {
  const map = useMap();
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const locate = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      const { latitude, longitude } = pos.coords;
      map.flyTo([latitude, longitude], 13);
      onLocate?.(latitude, longitude);
    });
  };
  return (
    <div className="cp-mapctrls" onMouseDown={stop} onDoubleClick={stop}>
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
        <button type="button" aria-label="ซูมเข้า" className="cp-focus" onClick={() => map.zoomIn()} style={ctrlBtn}>
          +
        </button>
        <button
          type="button"
          aria-label="ซูมออก"
          className="cp-focus"
          onClick={() => map.zoomOut()}
          style={{ ...ctrlBtn, borderTop: `1px solid ${T.line}` }}
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

export default function MapView({
  stations,
  routeData,
  fires,
  startPin,
  endPin,
  showHeatmap,
  showStations,
  hoveredRouteId,
  selectedRouteId,
  onMapClick,
  onSelectStation,
  onLocate,
}: MapViewProps) {
  const pmVals = stations
    .filter((s) => s.pm25 != null)
    .map((s) => s.pm25 as number);
  const pmMin = pmVals.length ? Math.min(...pmVals) : 0;
  const pmMax = pmVals.length ? Math.max(...pmVals) : 50;

  return (
    <MapContainer
      center={THAILAND_CENTER}
      zoom={DEFAULT_ZOOM}
      zoomControl={false}
      className="h-full w-full"
      scrollWheelZoom
    >
      <TileLayer url={OSM_TILE_URL} attribution={OSM_ATTRIBUTION} />

      {showHeatmap && <IdwSurface stations={stations} min={pmMin} max={pmMax} />}
      {showStations && <StationMarkers stations={stations} onSelect={onSelectStation} />}
      {routeData && (
        <RouteLayer
          routes={routeData.routes}
          recommendedId={routeData.recommended_id}
          selectedId={selectedRouteId ?? routeData.recommended_id}
          hoveredId={hoveredRouteId}
        />
      )}
      {fires.length > 0 && <FireLayer fires={fires} />}

      {startPin && <Marker position={[startPin.lat, startPin.lon]} icon={pinIcon("A", "#2bbf73")} />}
      {endPin && <Marker position={[endPin.lat, endPin.lon]} icon={pinIcon("B", "#e0554b")} />}

      <AutoResize />
      <MapControls onLocate={onLocate} />
      <ClickHandler onClick={onMapClick} />
    </MapContainer>
  );
}
