"use client";

import { useEffect } from "react";
import { useMap } from "react-leaflet";

export default function ViewportController({
  target,
}: {
  target: { lat: number; lon: number } | null;
}) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lon], 13, { duration: 0.8 });
  }, [map, target]);
  return null;
}
