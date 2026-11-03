import { classifyPm25 } from "@/frontend/lib/aqi";
import { gridAxisIndex } from "@/frontend/lib/forecast-grid";
import type { GridSurface } from "@/frontend/types/ui";

/** Full rectangular extent of received cells, including their outer half-cell edges. */
export function camsRasterBounds(
  surface: GridSurface,
): [[number, number], [number, number]] {
  const edges = (axis: number[]) => {
    const last = axis.length - 1;
    const firstStep = axis.length > 1 ? axis[1] - axis[0] : 0.4;
    const lastStep = axis.length > 1 ? axis[last] - axis[last - 1] : 0.4;
    return [axis[0] - firstStep / 2, axis[last] + lastStep / 2];
  };
  const [south, north] = edges(surface.latitudes);
  const [west, east] = edges(surface.longitudes);
  return [
    [south, west],
    [north, east],
  ];
}
const mercator = (lat: number) => Math.asinh(Math.tan((lat * Math.PI) / 180));
/** Render native cells with hard boundaries in Web Mercator; never blend neighbouring values. */
function* rasterRows(
  surface: GridSurface,
  width = 512,
  height = 960,
): Generator<void, Uint8ClampedArray> {
  const pixels = new Uint8ClampedArray(width * height * 4);
  if (!surface.latitudes.length || !surface.longitudes.length) return pixels;
  const [[southLat, west], [northLat, east]] = camsRasterBounds(surface);
  const north = mercator(northLat),
    south = mercator(southLat);
  const xs = Array.from({ length: width }, (_, x) =>
    gridAxisIndex(
      surface.longitudes,
      west + ((x + 0.5) / width) * (east - west),
    ),
  );
  const ys = Array.from({ length: height }, (_, y) =>
    gridAxisIndex(
      surface.latitudes,
      (Math.atan(Math.sinh(north + ((south - north) * (y + 0.5)) / height)) *
        180) /
        Math.PI,
    ),
  );
  const colours = new Map<number, number>();
  for (let y = 0; y < height; y++) {
    if (y % 32 === 0) yield;
    const row = ys[y];
    if (row === null) continue;
    for (let x = 0; x < width; x++) {
      const col = xs[x];
      if (col === null) continue;
      const value = surface.values[row * surface.longitudes.length + col];
      if (value == null || !Number.isFinite(value) || value < 0) continue;
      if (!colours.has(value))
        colours.set(
          value,
          Number.parseInt(classifyPm25(value).color.slice(1), 16),
        );
      const boundary =
        (x > 0 && xs[x - 1] !== col) || (y > 0 && ys[y - 1] !== row);
      const colour = boundary ? 0x64748b : colours.get(value)!;
      const offset = (y * width + x) * 4;
      pixels[offset] = colour >> 16;
      pixels[offset + 1] = (colour >> 8) & 255;
      pixels[offset + 2] = colour & 255;
      pixels[offset + 3] = 255;
    }
  }
  return pixels;
}
/** Synchronous entry for worker and pure numerical tests. */
export function renderCamsPixels(
  surface: GridSurface,
  width = 512,
  height = 960,
) {
  const rows = rasterRows(surface, width, height);
  let result = rows.next();
  while (!result.done) result = rows.next();
  return result.value;
}
/** Cooperative fallback for browsers without OffscreenCanvas workers. */
export async function renderCamsPixelsAsync(
  surface: GridSurface,
  width = 512,
  height = 960,
) {
  const rows = rasterRows(surface, width, height);
  let result = rows.next();
  while (!result.done) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    result = rows.next();
  }
  return result.value;
}
