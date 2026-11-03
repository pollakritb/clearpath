"use client";

import L from "leaflet";
import { useMemo } from "react";
import { Marker } from "react-leaflet";

const icon = L.divIcon({
  className: "cp-request-location-marker",
  html: '<svg width="56" height="82" viewBox="0 0 56 82" fill="none" aria-hidden="true" style="display:block"><path d="M28 49V77" stroke="#0d3b29" stroke-width="5" stroke-linecap="round"/><circle cx="28" cy="28" r="24" fill="#0d3b29"/><circle cx="28" cy="28" r="8" fill="white"/></svg>',
  iconSize: [56, 82],
  iconAnchor: [28, 79],
});

export default function RequestLocationMarker({
  position,
  onMove,
}: {
  position: { lat: number; lon: number };
  onMove?: (lat: number, lon: number) => void;
}) {
  const handlers = useMemo(
    () => ({
      dragend(event: L.DragEndEvent) {
        const point = (event.target as L.Marker).getLatLng();
        onMove?.(point.lat, point.lng);
      },
    }),
    [onMove],
  );
  return (
    <Marker
      position={[position.lat, position.lon]}
      icon={icon}
      draggable={Boolean(onMove)}
      autoPan
      bubblingMouseEvents={false}
      zIndexOffset={1800}
      eventHandlers={handlers}
      title={
        onMove ? "ลากหมุดเพื่อเปลี่ยนจุดขอค่าฝุ่น" : "จุดที่เลือกขอค่าฝุ่น"
      }
      alt="ตำแหน่งคำขอค่าฝุ่น"
    />
  );
}
