"use client";

import "leaflet/dist/leaflet.css";

import {
  CircleMarker,
  MapContainer,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { useEffect } from "react";

type Position = { lat: number; lon: number };
function Selection({
  position,
  onChange,
}: {
  position: Position;
  onChange: (position: Position) => void;
}) {
  const map = useMap();
  useEffect(() => {
    map.setView([position.lat, position.lon]);
  }, [map, position.lat, position.lon]);
  useMapEvents({
    click: (event) =>
      onChange({ lat: event.latlng.lat, lon: event.latlng.lng }),
  });
  return (
    <CircleMarker
      center={[position.lat, position.lon]}
      radius={9}
      pathOptions={{
        color: "#fff",
        weight: 3,
        fillColor: "#08796d",
        fillOpacity: 1,
      }}
    />
  );
}
export default function PhotoLocationPicker({
  position,
  onChange,
}: {
  position: Position;
  onChange: (position: Position) => void;
}) {
  return (
    <div
      className="cp-photo-location-map"
      aria-label="แตะแผนที่เพื่อระบุตำแหน่งที่วัด"
    >
      <MapContainer
        center={[position.lat, position.lon]}
        zoom={15}
        scrollWheelZoom={false}
        style={{ height: 200, width: "100%" }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />
        <Selection position={position} onChange={onChange} />
      </MapContainer>
    </div>
  );
}
