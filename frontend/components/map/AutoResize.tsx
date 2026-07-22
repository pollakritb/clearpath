"use client";

import { useEffect } from "react";
import { useMap } from "react-leaflet";

export default function AutoResize() {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(container);
    const initialResize = window.setTimeout(() => map.invalidateSize(), 200);

    return () => {
      observer.disconnect();
      window.clearTimeout(initialResize);
    };
  }, [map]);

  return null;
}
