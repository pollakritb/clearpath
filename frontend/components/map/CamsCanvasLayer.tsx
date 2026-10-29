"use client";
import L from "leaflet";
import { useLayoutEffect } from "react";
import { useMap } from "react-leaflet";
import { classifyPm25 } from "@/frontend/lib/aqi";
import { gridValue } from "@/frontend/lib/forecast-grid";
import type { GridSurface } from "@/frontend/types/ui";

/** Pixel colours come from the same concentration sampler used by the tap card. */
export default function CamsCanvasLayer({
  surface,
}: {
  surface: GridSurface | null;
}) {
  const map = useMap();
  useLayoutEffect(() => {
    if (!surface) return;
    const canvas = L.DomUtil.create("canvas", "cp-cams-canvas");
    canvas.setAttribute("aria-hidden", "true");
    map.getPanes().overlayPane.appendChild(canvas);
    let raf = 0;
    const draw = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const size = map.getSize();
        const scale = Math.max(3, size.x / 480, size.y / 480);
        const width = Math.ceil(size.x / scale),
          height = Math.ceil(size.y / scale);
        canvas.width = width;
        canvas.height = height;
        canvas.style.width = `${size.x}px`;
        canvas.style.height = `${size.y}px`;
        L.DomUtil.setPosition(canvas, map.containerPointToLayerPoint([0, 0]));
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const image = ctx.createImageData(width, height);
        const lats = Array.from(
          { length: height },
          (_, i) => map.containerPointToLatLng([0, (i + 0.5) * scale]).lat,
        );
        const lons = Array.from(
          { length: width },
          (_, i) => map.containerPointToLatLng([(i + 0.5) * scale, 0]).lng,
        );
        for (let y = 0; y < height; y++)
          for (let x = 0; x < width; x++) {
            const value = gridValue(surface, lats[y], lons[x]);
            if (value == null) continue;
            const hex = classifyPm25(value).color;
            const index = (y * width + x) * 4;
            image.data[index] = parseInt(hex.slice(1, 3), 16);
            image.data[index + 1] = parseInt(hex.slice(3, 5), 16);
            image.data[index + 2] = parseInt(hex.slice(5, 7), 16);
            image.data[index + 3] = 255;
          }
        ctx.putImageData(image, 0, 0);
      });
    };
    const hide = () => {
      canvas.style.visibility = "hidden";
    };
    const redraw = () => {
      canvas.style.visibility = "visible";
      draw();
    };
    map.on("moveend resize zoomend", redraw);
    map.on("zoomstart", hide);
    draw();
    return () => {
      cancelAnimationFrame(raf);
      map.off("moveend resize zoomend", redraw);
      map.off("zoomstart", hide);
      canvas.remove();
    };
  }, [map, surface]);
  return null;
}
