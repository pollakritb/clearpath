"use client";

import L from "leaflet";
import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";

import type { MapFocusPoint } from "@/frontend/types/ui";

import { DEFAULT_ZOOM, THAILAND_CENTER } from "@/frontend/lib/constants";

export default function ViewportController({
  target,
  dataMode = "current",
  radiusKm,
  resetViewSignal = 0,
}: {
  dataMode?: string;
  target: MapFocusPoint | null;
  radiusKm?: number;
  resetViewSignal?: number;
}) {
  const map = useMap();
  const lat = target?.lat,
    lon = target?.lon;
  const pin = target?.pin,
    token = target?.token;
  const previousPin = useRef<string | null>(null);
  const previousMode = useRef(dataMode);
  const previousResetSignal = useRef(resetViewSignal);
  const previousView = useRef<{
    lat: number;
    lon: number;
    zoom: number;
  } | null>(null);
  useEffect(() => {
    const pinKey = pin ? `${lat}:${lon}:${token}` : null;
    const changedPin = pinKey != null && pinKey !== previousPin.current;
    previousPin.current = pinKey;
    if (previousMode.current !== dataMode) {
      previousMode.current = dataMode;
      previousView.current = null;
      if (!changedPin) return;
    }
    if (resetViewSignal !== previousResetSignal.current) {
      previousResetSignal.current = resetViewSignal;
      previousView.current = null;
      map.flyTo(THAILAND_CENTER, DEFAULT_ZOOM, { duration: 0.8 });
      return;
    }
    if (pin) {
      if (!changedPin || lat == null || lon == null) return;
      previousView.current = null;
      const zoom = Math.min(map.getMaxZoom(), Math.max(map.getZoom(), 15));
      const height = map.getSize().y;
      const top = Math.min(130, height * 0.2);
      const bottom = Math.min(300, height * 0.4);
      const center = map.unproject(
        map.project([lat, lon], zoom).add([0, (bottom - top) / 2]),
        zoom,
      );
      map.flyTo(center, zoom, { duration: 0.65 });
      return;
    }
    if (radiusKm) {
      if (lat == null || lon == null) return;
      if (!previousView.current) {
        const center = map.getCenter();
        previousView.current = {
          lat: center.lat,
          lon: center.lng,
          zoom: map.getZoom(),
        };
      }
      const bounds = L.latLng(lat, lon).toBounds(radiusKm * 2000);
      map.fitBounds(bounds, {
        animate: true,
        paddingTopLeft: [18, 130],
        paddingBottomRight: [18, Math.min(window.innerHeight * 0.42, 330)],
      });
    } else {
      const previous = previousView.current;
      previousView.current = null;
      if (lat != null && lon != null)
        map.flyTo([lat, lon], 13, { duration: 0.8 });
      else if (previous)
        map.flyTo([previous.lat, previous.lon], previous.zoom, {
          duration: 0.8,
        });
    }
  }, [map, lat, lon, pin, token, radiusKm, resetViewSignal, dataMode]);
  return null;
}
