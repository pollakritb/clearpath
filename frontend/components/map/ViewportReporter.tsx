"use client";

import { useCallback, useEffect } from "react";
import { useMap, useMapEvents } from "react-leaflet";

import type { ViewportBounds } from "@/frontend/types/ui";

export default function ViewportReporter({
  onChange,
}: {
  onChange: (bounds: ViewportBounds) => void;
}) {
  const map = useMap();
  const publish = useCallback(() => {
    const bounds = map.getBounds();
    onChange({
      min_lat: bounds.getSouth(),
      max_lat: bounds.getNorth(),
      min_lon: bounds.getWest(),
      max_lon: bounds.getEast(),
    });
  }, [map, onChange]);

  useMapEvents({
    moveend: publish,
    zoomend: publish,
  });

  useEffect(() => publish(), [publish]);
  return null;
}
