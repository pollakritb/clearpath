import { describe, it, expect } from "vitest";
import {
  FORECAST_COLOR_STOPS,
  forecastColor,
  forecastColorPacked,
  classifyPm25,
} from "./aqi";
import { renderCamsPixels, renderCamsPixelsAsync } from "./cams-raster";
import type { GridSurface } from "@/frontend/types/ui";
const grid: GridSurface = {
  latitudes: [4.4, 21.6],
  longitudes: [96.4, 106.4],
  values: [10, 40, 10, 40],
  generationId: "raster",
  validAt: "2030-01-01T00:00Z",
};
describe("smooth forecast presentation", () => {
  it("uses the central palette at band midpoints, with continuous transitions and unchanged categories", () => {
    for (const stop of FORECAST_COLOR_STOPS) {
      expect(forecastColor(stop.value)).toBe(stop.color);
      expect(classifyPm25(stop.value).color).toBe(stop.color);
    }
    expect(forecastColor(15)).not.toBe(forecastColor(15.2));
    const a = forecastColorPacked(24.999),
      b = forecastColorPacked(25.001);
    for (const shift of [0, 8, 16])
      expect(
        Math.abs(((a >> shift) & 255) - ((b >> shift) & 255)),
      ).toBeLessThanOrEqual(1);
    expect(forecastColor(null)).toBe(classifyPm25(null).color);
    expect(forecastColor(NaN)).toBe(classifyPm25(null).color);
    expect(forecastColor(2000)).toBe(FORECAST_COLOR_STOPS.at(-1)!.color);
  });
  it("renders varying colours across a constant-gradient grid without categorical steps", () => {
    const pixels = renderCamsPixels(grid, 64, 128);
    const colours = new Set<string>();
    for (let x = 0; x < 64; x++) {
      const offset = (64 * 64 + x) * 4;
      expect(pixels[offset + 3]).toBe(255);
      colours.add([...pixels.slice(offset, offset + 3)].join(","));
    }
    expect(colours.size).toBeGreaterThan(50);
  });
  it("keeps missing values transparent and does not bridge missing cells", () => {
    const pixels = renderCamsPixels(
      { ...grid, values: [null, 40, 10, 40] },
      16,
      32,
    );
    expect(
      [...pixels].filter((_, i) => i % 4 === 3).every((alpha) => alpha === 0),
    ).toBe(true);
  });
});

it("cooperative rendering produces the same numerical raster as worker rendering", async () => {
  expect(await renderCamsPixelsAsync(grid, 32, 64)).toEqual(
    renderCamsPixels(grid, 32, 64),
  );
});
