"use client";
import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer } from "react-leaflet";
import RequestLocationMarker from "@/frontend/components/map/RequestLocationMarker";

export default function HelperLocationMap({
  point,
  onMove,
}: {
  point: { lat: number; lon: number };
  onMove: (lat: number, lon: number) => void;
}) {
  return (
    <MapContainer
      center={[point.lat, point.lon]}
      zoom={15}
      style={{ height: 240, width: "100%", borderRadius: 14 }}
      zoomControl={false}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      />
      <RequestLocationMarker position={point} radiusKm={0} onMove={onMove} />
    </MapContainer>
  );
}
