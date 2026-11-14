"use client";
import PriorityMarker from "./PriorityMarker";

import L from "leaflet";
import { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Circle, useMap, useMapEvents } from "react-leaflet";
import { flyMapTo } from "@/frontend/lib/map-motion";

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
  minimumZoom,
}: {
  position: Point | null;
  radiusKm: number;
  minimumZoom: number;
  onMove: (lat: number, lon: number) => void;
}) {
  const map = useMap();
  const circle = useRef<L.Circle>(null);
  const published = useRef<Point | null>(null);
  const initialized = useRef(false);
  const previousMinimumZoom = useRef(minimumZoom);
  const positioning = useRef(false);
  const userMove = useRef(false);
  const onMoveRef = useRef(onMove);
  useEffect(() => {
    onMoveRef.current = onMove;
  }, [onMove]);
  const lat = position?.lat,
    lon = position?.lon;
  const publish = useCallback(() => {
    if (positioning.current) return;
    const center = map.getCenter();
    if (
      published.current?.lat === center.lat &&
      published.current.lon === center.lng
    )
      return;
    published.current = { lat: center.lat, lon: center.lng };
    onMoveRef.current(center.lat, center.lng);
  }, [map]);
  useMapEvents({
    dragstart() {
      positioning.current = false;
      userMove.current = true;
    },
    keydown(event) {
      if (
        [
          "ArrowUp",
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
          "+",
          "-",
          "=",
        ].includes(event.originalEvent.key)
      ) {
        positioning.current = false;
        userMove.current = true;
      }
    },
    move() {
      circle.current?.setLatLng(map.getCenter());
    },
    moveend() {
      if (positioning.current) return;
      if (!userMove.current) {
        // Layout changes or a previous viewport animation must not move the chosen place.
        const chosen = published.current;
        if (
          chosen &&
          !L.latLng(chosen.lat, chosen.lon).equals(map.getCenter())
        ) {
          positioning.current = true;
          map.stop();
          map.setView(L.latLng(chosen.lat, chosen.lon), map.getZoom(), {
            animate: false,
          });
          circle.current?.setLatLng(map.getCenter());
          positioning.current = false;
        }
        return;
      }
      userMove.current = false;
      publish();
    },
  });
  useEffect(() => {
    const container = map.getContainer();
    const wheel = () => {
      positioning.current = false;
      userMove.current = true;
    };
    const pinch = (event: TouchEvent) => {
      if (event.touches.length > 1) {
        positioning.current = false;
        userMove.current = true;
      }
    };
    container.addEventListener("wheel", wheel, { passive: true });
    container.addEventListener("touchmove", pinch, { passive: true });
    return () => {
      container.removeEventListener("wheel", wheel);
      container.removeEventListener("touchmove", pinch);
    };
  }, [map]);
  useEffect(() => {
    const zoomRequested = minimumZoom > previousMinimumZoom.current;
    previousMinimumZoom.current = minimumZoom;
    // Points emitted by this picker must never recenter the map or reset its zoom.
    if (
      initialized.current &&
      lat === published.current?.lat &&
      lon === published.current?.lon &&
      !(zoomRequested && map.getZoom() < minimumZoom)
    )
      return;
    const center =
      lat != null && lon != null ? L.latLng(lat, lon) : map.getCenter();
    const animate = initialized.current;
    const zoom = Math.max(minimumZoom, map.getZoom());
    initialized.current = true;
    // setView/stop emit moveend too. Those events are not a user-selected point.
    positioning.current = true;
    userMove.current = false;
    map.stop();
    if (animate) {
      // Keep intermediate animation frames out of the chosen location/address.
      published.current = { lat: center.lat, lon: center.lng };
      const finished = () => {
        positioning.current = false;
        circle.current?.setLatLng(map.getCenter());
      };
      map.once("moveend", finished);
      flyMapTo(map, center, zoom);
      return () => {
        map.off("moveend", finished);
      };
    }
    map.setView(center, zoom, { animate: false });
    circle.current?.setLatLng(map.getCenter());
    if (lat != null && lon != null) {
      const actual = map.getCenter();
      published.current = { lat: actual.lat, lon: actual.lng };
    }
    positioning.current = false;
    if (lat == null || lon == null) publish();
  }, [map, lat, lon, publish, minimumZoom]);
  return (
    <>
      {radiusKm > 0 && (
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
      )}
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
  radiusKm = 2,
  onMove,
  minimumZoom = 13,
}: {
  position: Point | null;
  radiusKm?: number;
  minimumZoom?: number;
  onMove?: (lat: number, lon: number) => void;
}) {
  if (onMove)
    return (
      <CenterPicker
        position={position}
        radiusKm={radiusKm}
        onMove={onMove}
        minimumZoom={minimumZoom}
      />
    );
  if (!position) return null;
  return (
    <PriorityMarker
      priorityId="request-picker"
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
