"use client";
import L from "leaflet";
import { useEffect, useLayoutEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import { camsRasterBounds } from "@/frontend/lib/cams-raster";
import {
  cachedCamsRaster,
  prepareCamsRaster,
} from "@/frontend/lib/cams-raster-client";
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
    const url = cachedCamsRaster(surface);
    if (!url) return;
    const bounds = camsRasterBounds(surface);
    if (layer.current)
      layer.current.setBounds(L.latLngBounds(bounds)).setUrl(url);
    else {
      layer.current = L.imageOverlay(url, bounds, {
        opacity: 0.4,
        interactive: false,
        className: "cp-cams-canvas",
        zIndex: 0,
      }).addTo(map);
      layer.current.getElement()?.setAttribute("aria-hidden", "true");
      const element = layer.current.getElement();
      if (element) {
        element.style.imageRendering = "pixelated";
      }
    }
  }, [map, surface]);
  useEffect(() => {
    if (!surface || !preload?.length) return;
    let token = 0,
      index = 0;
    const idle = typeof window.requestIdleCallback === "function";
    const warm = () => {
      void prepareCamsRaster(preload[index++]).catch(() => {});
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
