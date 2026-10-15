"use client";

import L from "leaflet";
import { useEffect } from "react";
import { Marker, Polyline, Popup, useMap } from "react-leaflet";

import { haversineKm } from "@/frontend/lib/idw";
import type { ForecastResponse } from "@/frontend/types";

const requestedIcon = L.divIcon({
  className: "cp-forecast-marker",
  html: '<span class="cp-forecast-marker__requested" aria-hidden="true"></span>',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});
const gridIcon = L.divIcon({
  className: "cp-forecast-marker",
  html: '<span class="cp-forecast-marker__grid" aria-hidden="true"></span>',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});
const overlapIcon = L.divIcon({
  className: "cp-forecast-marker",
  html: '<span class="cp-forecast-marker__overlap" aria-hidden="true"><i></i></span>',
  iconSize: [34, 34],
  iconAnchor: [17, 17],
});

export default function ForecastDiagnosticLayer({
  forecast,
}: {
  forecast: ForecastResponse;
}) {
  const map = useMap();
  const { requested_lat, requested_lon, grid_lat, grid_lon } = forecast;
  const hasRequested = requested_lat != null && requested_lon != null;
  const hasGrid = grid_lat != null && grid_lon != null;
  const distance =
    hasRequested && hasGrid
      ? haversineKm(requested_lat, requested_lon, grid_lat, grid_lon)
      : null;
  const overlapping = distance != null && distance < 0.03;

  useEffect(() => {
    if (!hasRequested) return;
    if (!hasGrid || overlapping) {
      map.flyTo([requested_lat, requested_lon], Math.max(map.getZoom(), 11));
      return;
    }
    map.fitBounds(
      [
        [requested_lat, requested_lon],
        [grid_lat, grid_lon],
      ],
      { paddingTopLeft: [32, 170], paddingBottomRight: [32, 250], maxZoom: 12 },
    );
  }, [
    map,
    requested_lat,
    requested_lon,
    grid_lat,
    grid_lon,
    hasRequested,
    hasGrid,
    overlapping,
  ]);

  if (!hasRequested) return null;
  const requested: [number, number] = [requested_lat, requested_lon];
  const grid: [number, number] | null = hasGrid ? [grid_lat, grid_lon] : null;
  if (overlapping) {
    return (
      <Marker position={requested} icon={overlapIcon} zIndexOffset={2100}>
        <Popup>
          <strong>พิกัดส่งคำขอและศูนย์กลาง grid ซ้อนกัน</strong>
          <br />
          ส่ง: {requested_lat.toFixed(4)}, {requested_lon.toFixed(4)}
          <br />
          Grid: {grid_lat?.toFixed(4)}, {grid_lon?.toFixed(4)}
          <br />
          ระยะห่าง {distance?.toFixed(2)} กม. — grid ไม่ใช่สถานีตรวจวัด
        </Popup>
      </Marker>
    );
  }
  return (
    <>
      {grid && (
        <Polyline
          positions={[requested, grid]}
          pathOptions={{ color: "#7455a6", weight: 2, dashArray: "6 6" }}
        />
      )}
      <Marker position={requested} icon={requestedIcon} zIndexOffset={2100}>
        <Popup>
          <strong>พิกัดที่ส่งไปพยากรณ์</strong>
          <br />
          {requested_lat.toFixed(4)}, {requested_lon.toFixed(4)}
        </Popup>
      </Marker>
      {grid && (
        <Marker position={grid} icon={gridIcon} zIndexOffset={2050}>
          <Popup>
            <strong>ศูนย์กลาง grid ของ CAMS</strong>
            <br />
            {grid_lat?.toFixed(4)}, {grid_lon?.toFixed(4)}
            <br />
            ไม่ใช่สถานีตรวจวัด · ห่างจากจุดที่ส่ง {distance?.toFixed(2)} กม.
          </Popup>
        </Marker>
      )}
    </>
  );
}
