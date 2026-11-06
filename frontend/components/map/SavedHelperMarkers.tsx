"use client";
import L from "leaflet";
import { Marker, Popup } from "react-leaflet";
import type { MeasurementHelperLocation } from "@/frontend/types";
import { helperLocationEmoji } from "@/frontend/lib/helper-location-emoji";

export default function SavedHelperMarkers({
  locations,
}: {
  locations: MeasurementHelperLocation[];
}) {
  return (
    <>
      {locations.map((place) => (
        <Marker
          key={place.slot}
          zIndexOffset={1000}
          position={[place.lat, place.lon]}
          title={`สถานที่ของฉัน: ${place.name}`}
          alt={`สถานที่ของฉัน: ${place.name}`}
          icon={L.divIcon({
            className: "cp-saved-helper-marker",
            html: `<span>${helperLocationEmoji(place.emoji)}</span>`,
            iconSize: [44, 44],
            iconAnchor: [22, 44],
            popupAnchor: [0, -42],
          })}
        >
          <Popup minWidth={180} className="cp-saved-helper-popup">
            <strong>{place.name}</strong>
            <br />
            {place.enabled ? "เปิดรับคำขอ" : "พักรับคำขอ"} · เฉพาะคุณ
          </Popup>
        </Marker>
      ))}
    </>
  );
}
