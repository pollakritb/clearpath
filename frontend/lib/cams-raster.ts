import { FORECAST_COLOR_STOPS, forecastColorPacked } from "@/frontend/lib/aqi";
import { sampleGridCell } from "@/frontend/lib/forecast-grid";
import type { GridSurface } from "@/frontend/types/ui";

export const CAMS_RASTER_BOUNDS: [[number, number], [number, number]] = [
  [5, 97],
  [21, 106],
];
const mercator = (lat: number) => Math.asinh(Math.tan((lat * Math.PI) / 180));
/** Sample in Web Mercator so Leaflet's pan/zoom transforms align the raster exactly. */
function* rasterRows(
  surface: GridSurface,
  width = 512,
  height = 960,
): Generator<void, Uint8ClampedArray> {
  const pixels = new Uint8ClampedArray(width * height * 4);
  const north = mercator(21),
    south = mercator(5);
  const position = (axis: number[], value: number) => {
    if (value < axis[0] || value > axis.at(-1)!) return null;
    const index = Math.min(
      axis.length - 2,
      Math.max(0, axis.findIndex((v) => v >= value) - 1),
    );
    return {
      index,
      weight: (value - axis[index]) / (axis[index + 1] - axis[index]),
    };
  };
  const xs = Array.from({ length: width }, (_, x) =>
    position(surface.longitudes, 97 + ((x + 0.5) / width) * 9),
  );
  const ys = Array.from({ length: height }, (_, y) =>
    position(
      surface.latitudes,
      (Math.atan(Math.sinh(north + ((south - north) * (y + 0.5)) / height)) *
        180) /
        Math.PI,
    ),
  );
  // Quantized to 0.01 µg/m³ for the colour lookup only; concentration is never rounded here.
  const maxColour = Math.ceil(FORECAST_COLOR_STOPS.at(-1)!.value * 100);
  const colours = new Uint32Array(maxColour + 1);
  const known = new Uint8Array(colours.length);
  for (let y = 0; y < height; y++) {
    if (y % 32 === 0) yield;
    const row = ys[y];
    if (!row) continue;
    for (let x = 0; x < width; x++) {
      const col = xs[x];
      if (!col) continue;
      const value = sampleGridCell(
        surface.values,
        surface.longitudes.length,
        row.index,
        col.index,
        col.weight,
        row.weight,
      );
      if (value == null) continue;
      const quantized = Math.max(
        0,
        Math.min(maxColour, Math.round(value * 100)),
      );
      if (!known[quantized]) {
        colours[quantized] = forecastColorPacked(quantized / 100);
        known[quantized] = 1;
      }
      const colour = colours[quantized],
        offset = (y * width + x) * 4;
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
