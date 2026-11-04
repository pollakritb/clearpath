"use client";
import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import { MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet";
import RequestLocationMarker from "@/frontend/components/map/RequestLocationMarker";

function ResizeMap({
  onZoomChange,
}: {
  onZoomChange?: (zoom: number) => void;
}) {
  const map = useMap();
  useMapEvents({ zoomend: () => onZoomChange?.(map.getZoom()) });
  useEffect(() => {
    const observer = new ResizeObserver(() =>
      map.invalidateSize({ pan: false }),
    );
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return null;
}

export default function HelperLocationMap({
  point,
  initialZoom = 15,
  onZoomChange,
  onMove,
}: {
  point: { lat: number; lon: number };
  initialZoom?: number;
  onZoomChange?: (zoom: number) => void;
  onMove: (lat: number, lon: number) => void;
}) {
  return (
    <MapContainer
      center={[point.lat, point.lon]}
      zoom={initialZoom}
      style={{ height: "100%", width: "100%" }}
      zoomControl={false}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      />
      <ResizeMap onZoomChange={onZoomChange} />
      <RequestLocationMarker
        position={point}
        radiusKm={0}
        onMove={onMove}
        minimumZoom={initialZoom}
      />
    </MapContainer>
  );
}
