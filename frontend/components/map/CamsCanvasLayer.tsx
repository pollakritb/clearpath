"use client";
import L from "leaflet";
import { useEffect, useId, useLayoutEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import { CAMS_RASTER_BOUNDS } from "@/frontend/lib/cams-raster";
import { THAILAND_CLIP_PATH } from "@/frontend/lib/thailand-boundary";
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
  const clipId = `cams-thailand-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
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
    if (layer.current) layer.current.setUrl(url);
    else {
      layer.current = L.imageOverlay(url, CAMS_RASTER_BOUNDS, {
        opacity: 0.4,
        interactive: false,
        className: "cp-cams-canvas",
        zIndex: 0,
      }).addTo(map);
      layer.current.getElement()?.setAttribute("aria-hidden", "true");
      const element = layer.current.getElement();
      if (element) element.style.clipPath = `url(#${clipId})`;
    }
  }, [map, surface, clipId]);
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
  return (
    <svg
      width="0"
      height="0"
      aria-hidden="true"
      focusable="false"
      style={{ position: "absolute", pointerEvents: "none" }}
    >
      <defs>
        <clipPath id={clipId} clipPathUnits="objectBoundingBox">
          <path d={THAILAND_CLIP_PATH} clipRule="evenodd" />
        </clipPath>
      </defs>
    </svg>
  );
}
