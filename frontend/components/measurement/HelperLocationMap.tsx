"use client";
import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { CURRENT_LOCATION_ICON } from "@/frontend/components/map/map-icons";
import MapControls from "@/frontend/components/map/MapControls";
import {
  OSM_TILE_URL,
  OSM_ATTRIBUTION,
  MAP_BOUNDS,
} from "@/frontend/lib/constants";
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
  userLocation,
  onLocate,
  initialZoom = 15,
  onZoomChange,
  onMove,
}: {
  point: { lat: number; lon: number };
  userLocation?: { lat: number; lon: number } | null;
  onLocate?: (lat: number, lon: number) => void;
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
      minZoom={5}
      maxBounds={MAP_BOUNDS}
      maxBoundsViscosity={1}
    >
      <TileLayer url={OSM_TILE_URL} attribution={OSM_ATTRIBUTION} noWrap />
      <ResizeMap onZoomChange={onZoomChange} />
      <MapControls
        showZoom={false}
        animateLocate={false}
        hasLocation={Boolean(userLocation)}
        onLocate={onLocate ?? onMove}
      />
      {userLocation && (
        <Marker
          position={[userLocation.lat, userLocation.lon]}
          icon={CURRENT_LOCATION_ICON}
          title="ตำแหน่งปัจจุบันของคุณ"
          alt="ตำแหน่งปัจจุบันของคุณ"
          zIndexOffset={1000}
          interactive={false}
          keyboard={false}
        />
      )}
      <RequestLocationMarker
        position={point}
        radiusKm={0}
        onMove={onMove}
        minimumZoom={initialZoom}
      />
    </MapContainer>
  );
}
