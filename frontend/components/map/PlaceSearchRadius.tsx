"use client";
import { Circle, CircleMarker, Polyline, Tooltip } from "react-leaflet";
/** A labelled search boundary: its fill never represents a PM2.5 reading. */
export default function PlaceSearchRadius({
  lat,
  lon,
  radiusKm,
}: {
  lat: number;
  lon: number;
  radiusKm: number;
}) {
  const edge: [number, number] = [
    lat,
    lon + radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180)),
  ];
  return (
    <>
      <Circle
        center={[lat, lon]}
        radius={radiusKm * 1000}
        pathOptions={{
          color: "#fff",
          weight: 6,
          fill: false,
          interactive: false,
        }}
      />
      <Circle
        center={[lat, lon]}
        radius={radiusKm * 1000}
        pathOptions={{
          color: "#087c78",
          weight: 2.5,
          fillColor: "#087c78",
          fillOpacity: 0.045,
          interactive: false,
        }}
      />
      <Polyline
        positions={[[lat, lon], edge]}
        pathOptions={{
          color: "#087c78",
          weight: 2,
          dashArray: "4 5",
          interactive: false,
        }}
      />
      <CircleMarker
        center={[lat + radiusKm / 111.32, lon]}
        radius={0}
        pathOptions={{ opacity: 0, fillOpacity: 0, interactive: false }}
      >
        <Tooltip
          permanent
          direction="bottom"
          offset={[0, 4]}
          className="cp-search-radius-label"
          opacity={1}
        >
          รัศมี {radiusKm} กม. · ค้นหาข้อมูล
        </Tooltip>
      </CircleMarker>
    </>
  );
}
