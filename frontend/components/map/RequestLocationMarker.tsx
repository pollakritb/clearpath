"use client";

import L from "leaflet";
import { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Circle, Marker, useMap, useMapEvents } from "react-leaflet";

const pinSvg =
  '<svg width="56" height="82" viewBox="0 0 56 82" fill="none" aria-hidden="true" style="display:block"><path d="M28 49V77" stroke="#0d3b29" stroke-width="5" stroke-linecap="round"/><circle cx="28" cy="28" r="24" fill="#0d3b29"/><circle cx="28" cy="28" r="8" fill="white"/></svg>';
const icon = L.divIcon({
  className: "cp-request-location-marker",
  html: pinSvg,
  iconSize: [56, 82],
  iconAnchor: [28, 79],
});
type Point = { lat: number; lon: number };

function CenterPicker({
  position,
  radiusKm,
  onMove,
}: {
  position: Point | null;
  radiusKm: number;
  onMove: (lat: number, lon: number) => void;
}) {
  const map = useMap();
  const circle = useRef<L.Circle>(null);
  const published = useRef<Point | null>(null);
  const initialized = useRef(false);
  const lat = position?.lat,
    lon = position?.lon;
  const publish = useCallback(() => {
    const center = map.getCenter();
    if (
      published.current?.lat === center.lat &&
      published.current.lon === center.lng
    )
      return;
    published.current = { lat: center.lat, lon: center.lng };
    onMove(center.lat, center.lng);
  }, [map, onMove]);
  useMapEvents({
    move() {
      circle.current?.setLatLng(map.getCenter());
    },
    moveend: publish,
  });
  useEffect(() => {
    // Points emitted by this picker must never recenter the map or reset its zoom.
    if (
      initialized.current &&
      lat === published.current?.lat &&
      lon === published.current?.lon
    )
      return;
    const center =
      lat != null && lon != null ? L.latLng(lat, lon) : map.getCenter();
    const zoom = initialized.current
      ? map.getZoom()
      : Math.max(13, map.getZoom());
    initialized.current = true;
    // Preserve a searched place's name until the user actually pans away.
    if (lat != null && lon != null) published.current = { lat, lon };
    map.setView(center, zoom, { animate: false });
    circle.current?.setLatLng(map.getCenter());
    publish();
  }, [map, lat, lon, publish]);
  return (
    <>
      <Circle
        ref={circle}
        center={map.getCenter()}
        radius={radiusKm * 1000}
        pathOptions={{
          color: "#35706c",
          weight: 2,
          dashArray: "7 6",
          fillColor: "#d7ebe8",
          fillOpacity: 0.13,
          interactive: false,
        }}
      />
      {createPortal(
        <div
          className="cp-request-center-pin"
          role="img"
          aria-label="หมุดคำขออยู่กลางแผนที่ เลื่อนแผนที่เพื่อเลือกตำแหน่ง"
          dangerouslySetInnerHTML={{ __html: pinSvg }}
        />,
        map.getContainer(),
      )}
    </>
  );
}

export default function RequestLocationMarker({
  position,
  radiusKm = 3,
  onMove,
}: {
  position: Point | null;
  radiusKm?: number;
  onMove?: (lat: number, lon: number) => void;
}) {
  if (onMove)
    return (
      <CenterPicker position={position} radiusKm={radiusKm} onMove={onMove} />
    );
  if (!position) return null;
  return (
    <Marker
      position={[position.lat, position.lon]}
      icon={icon}
      draggable={false}
      bubblingMouseEvents={false}
      zIndexOffset={1800}
      title="จุดที่เลือกขอค่าฝุ่น"
      alt="ตำแหน่งคำขอค่าฝุ่น"
    />
  );
}
