"use client";
import L from "leaflet";
import { useEffect, useLayoutEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import { CAMS_RASTER_BOUNDS, camsRasterUrl } from "@/frontend/lib/cams-raster";
import type { GridSurface } from "@/frontend/types/ui";

/** One Canvas-generated geographic raster. Leaflet keeps it visible during pan and zoom. */
export default function CamsCanvasLayer({
  surface,
  preload,
}: {
  surface: GridSurface | null;
  preload?: GridSurface[];
}) {
  const map = useMap();
  const layer = useRef<L.ImageOverlay | null>(null);
  useLayoutEffect(
    () => () => {
      layer.current?.remove();
      layer.current = null;
    },
    [map],
  );
  useLayoutEffect(() => {
    if (!surface) {
      layer.current?.remove();
      layer.current = null;
      return;
    }
    const url = camsRasterUrl(surface);
    if (layer.current) layer.current.setUrl(url);
    else {
      layer.current = L.imageOverlay(url, CAMS_RASTER_BOUNDS, {
        opacity: 0.4,
        interactive: false,
        className: "cp-cams-canvas",
        zIndex: 0,
      }).addTo(map);
      layer.current.getElement()?.setAttribute("aria-hidden", "true");
    }
  }, [map, surface]);
  useEffect(() => {
    if (!surface || !preload?.length) return;
    let token = 0,
      index = 0;
    const idle = typeof window.requestIdleCallback === "function";
    const warm = () => {
      camsRasterUrl(preload[index++]);
      if (index < preload.length) schedule();
    };
    const schedule = () => {
      token = idle
        ? window.requestIdleCallback(warm, { timeout: 1000 })
        : window.setTimeout(warm, 60);
    };
    schedule();
    return () => {
      if (idle) window.cancelIdleCallback(token);
      else clearTimeout(token);
    };
  }, [surface, preload]);
  return null;
}
