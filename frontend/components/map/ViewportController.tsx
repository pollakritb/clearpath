"use client";

import L from "leaflet";
import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";

export default function ViewportController({
  target,
  radiusKm,
}: {
  target: { lat: number; lon: number } | null;
  radiusKm?: number;
}) {
  const map = useMap();
  const previousView = useRef<{
    lat: number;
    lon: number;
    zoom: number;
  } | null>(null);
  useEffect(() => {
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
  }, [map, target, radiusKm]);
  return null;
}
