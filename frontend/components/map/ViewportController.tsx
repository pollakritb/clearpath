"use client";

import L from "leaflet";
import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";

import { DEFAULT_ZOOM, THAILAND_CENTER } from "@/frontend/lib/constants";

export default function ViewportController({
  target,
  radiusKm,
  resetViewSignal = 0,
}: {
  target: { lat: number; lon: number } | null;
  radiusKm?: number;
  resetViewSignal?: number;
}) {
  const map = useMap();
  const previousResetSignal = useRef(resetViewSignal);
  const previousView = useRef<{
    lat: number;
    lon: number;
    zoom: number;
  } | null>(null);
  useEffect(() => {
    if (resetViewSignal !== previousResetSignal.current) {
      previousResetSignal.current = resetViewSignal;
      previousView.current = null;
      map.flyTo(THAILAND_CENTER, DEFAULT_ZOOM, { duration: 0.8 });
      return;
    }
    if (radiusKm) {
      if (!target) return;
      if (!previousView.current) {
        const center = map.getCenter();
        previousView.current = {
          lat: center.lat,
          lon: center.lng,
          zoom: map.getZoom(),
        };
      }
      const bounds = L.latLng(target.lat, target.lon).toBounds(radiusKm * 2000);
      map.fitBounds(bounds, {
        animate: true,
        paddingTopLeft: [18, 130],
        paddingBottomRight: [18, Math.min(window.innerHeight * 0.42, 330)],
      });
    } else {
      const previous = previousView.current;
      previousView.current = null;
      if (target) map.flyTo([target.lat, target.lon], 13, { duration: 0.8 });
      else if (previous)
        map.flyTo([previous.lat, previous.lon], previous.zoom, {
          duration: 0.8,
        });
    }
  }, [map, target, radiusKm, resetViewSignal]);
  return null;
}
