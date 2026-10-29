"use client";
import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  Circle,
  CircleMarker,
  useMap,
} from "react-leaflet";
function Fit({
  lat,
  lon,
  radius,
}: {
  lat: number;
  lon: number;
  radius: number;
}) {
  const map = useMap();
  useEffect(() => {
    const latDelta = radius / 110;
    const lonDelta = radius / (110 * Math.cos((lat * Math.PI) / 180));
    map.fitBounds(
      [
        [lat - latDelta, lon - lonDelta],
        [lat + latDelta, lon + lonDelta],
      ],
      { padding: [12, 12], animate: false },
    );
  }, [map, lat, lon, radius]);
  return null;
}
export default function RequestAreaMap({
  lat,
  lon,
  radius,
}: {
  lat: number;
  lon: number;
  radius: number;
}) {
  return (
    <div aria-label={`บริเวณคำขอรัศมี ${radius} กิโลเมตร`}>
      <MapContainer
        center={[lat, lon]}
        zoom={12}
        style={{ height: 180, width: "100%", borderRadius: 12 }}
        scrollWheelZoom={false}
        dragging={false}
        zoomControl={false}
        touchZoom={false}
        doubleClickZoom={false}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />
        <Circle
          center={[lat, lon]}
          radius={radius * 1000}
          pathOptions={{ color: "#087c76", fillOpacity: 0.12, weight: 2 }}
        />
        <CircleMarker
          center={[lat, lon]}
          radius={5}
          pathOptions={{ color: "#fff", fillColor: "#087c76", fillOpacity: 1 }}
        />
        <Fit lat={lat} lon={lon} radius={radius} />
      </MapContainer>
    </div>
  );
}
