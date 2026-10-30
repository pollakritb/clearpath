"use client";
import { useEffect, useState } from "react";
import {
  cachedCamsRaster,
  prepareCamsRaster,
} from "@/frontend/lib/cams-raster-client";
import type { useForecastGrid } from "./useForecastGrid";

type Grid = ReturnType<typeof useForecastGrid>;
/** Commit raster, point concentration and timestamp together; ignore obsolete raster jobs. */
export function useCamsPresentation(grid: Grid): Grid {
  const { surface, meta, didPresent } = grid;
  const [ready, setReady] = useState<{
    surface: NonNullable<Grid["surface"]>;
    meta: Grid["meta"];
  } | null>(null);
  const [failedAt, setFailedAt] = useState<string | null>(null);
  useEffect(() => {
    if (!surface) return;
    let alive = true;
    void prepareCamsRaster(surface)
      .then(() => {
        if (alive) {
          setReady({ surface, meta });
          didPresent?.(surface);
          setFailedAt(null);
        }
      })
      .catch(() => {
        if (alive) setFailedAt(`${surface.generationId}:${surface.validAt}`);
      });
    return () => {
      alive = false;
    };
  }, [surface, meta, didPresent]);
  const cached = surface && cachedCamsRaster(surface);
  const displayed = cached
    ? surface
    : surface && ready && grid.times.includes(ready.surface.validAt)
      ? ready.surface
      : null;
  const preparing = !!surface && !cached;
  return {
    ...grid,
    surface: displayed,
    meta: preparing && ready && displayed ? ready.meta : grid.meta,
    at: displayed?.validAt ?? grid.at,
    pendingAt: preparing ? surface.validAt : grid.pendingAt,
    loading: grid.loading || (preparing && !displayed),
    error:
      !!surface && failedAt === `${surface.generationId}:${surface.validAt}`
        ? "เตรียมภาพพยากรณ์ไม่สำเร็จ กรุณาลองใหม่"
        : grid.error,
    playing: grid.playing,
  };
}
