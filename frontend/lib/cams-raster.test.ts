import { describe, it, expect } from "vitest";
import {
  FORECAST_COLOR_STOPS,
  forecastColor,
  forecastColorPacked,
  classifyPm25,
} from "./aqi";
import {
  camsRasterBounds,
  renderCamsPixels,
  renderCamsPixelsAsync,
} from "./cams-raster";
import type { GridSurface } from "@/frontend/types/ui";
const grid: GridSurface = {
  latitudes: [4.4, 21.6],
  longitudes: [96.4, 106.4],
  values: [10, 40, 10, 40],
  generationId: "raster",
  validAt: "2030-01-01T00:00Z",
};
describe("native CAMS grid presentation", () => {
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
  it("renders source cell colours and grid lines without blending neighbouring values", () => {
    const pixels = renderCamsPixels(grid, 64, 128);
    const colours = new Set<string>();
    for (let x = 0; x < 64; x++) {
      const offset = (64 * 64 + x) * 4;
      expect(pixels[offset + 3]).toBe(255);
      colours.add([...pixels.slice(offset, offset + 3)].join(","));
    }
    expect(colours).toEqual(
      new Set([
        [
          Number.parseInt(classifyPm25(10).color.slice(1), 16) >> 16,
          (Number.parseInt(classifyPm25(10).color.slice(1), 16) >> 8) & 255,
          Number.parseInt(classifyPm25(10).color.slice(1), 16) & 255,
        ].join(","),
        [
          Number.parseInt(classifyPm25(40).color.slice(1), 16) >> 16,
          (Number.parseInt(classifyPm25(40).color.slice(1), 16) >> 8) & 255,
          Number.parseInt(classifyPm25(40).color.slice(1), 16) & 255,
        ].join(","),
        "100,116,139",
      ]),
    );
  });
  it("keeps missing values transparent and does not bridge missing cells", () => {
    const pixels = renderCamsPixels(
      { ...grid, values: [null, 40, 10, 40] },
      16,
      32,
    );
    const alpha = (x: number, y: number) => pixels[(y * 16 + x) * 4 + 3];
    expect(alpha(1, 30)).toBe(0); // Missing southwest cell.
    expect(alpha(14, 30)).toBe(255); // Valid southeast neighbour stays visible.
    expect(alpha(1, 1)).toBe(255); // Valid northwest neighbour stays visible.
  });
});

it("cooperative rendering produces the same numerical raster as worker rendering", async () => {
  expect(await renderCamsPixelsAsync(grid, 32, 64)).toEqual(
    renderCamsPixels(grid, 32, 64),
  );
});

it("covers the full received rectangle including cells outside Thailand", () => {
  const source = {
    ...grid,
    latitudes: [4.4, 4.8],
    longitudes: [96.4, 96.8],
    values: [10, 10, 10, 10],
  };
  const bounds = camsRasterBounds(source);
  expect(bounds[0][0]).toBeCloseTo(4.2);
  expect(bounds[0][1]).toBeCloseTo(96.2);
  expect(bounds[1][0]).toBeCloseTo(5);
  expect(bounds[1][1]).toBeCloseTo(97);
  const pixels = renderCamsPixels(source, 32, 32);
  expect(pixels[3]).toBe(255);
  expect(pixels.at(-1)).toBe(255);
});

it("uses exactly one category colour for every value within the same PM2.5 band", () => {
  for (const values of [
    [0, 7, 14, 15],
    [15.1, 18, 24, 25],
    [25.1, 30, 37, 37.5],
    [37.6, 45, 70, 75],
    [75.1, 90, 120, 300],
  ]) {
    const pixels = renderCamsPixels({ ...grid, values }, 64, 128);
    const expected = classifyPm25(values[0])
      .color.match(/[a-f0-9]{2}/gi)!
      .map((v) => Number.parseInt(v, 16));
    for (let i = 0; i < pixels.length; i += 4) {
      const rgb = [...pixels.slice(i, i + 3)];
      if (pixels[i + 3] && rgb.join(",") !== "100,116,139")
        expect(rgb).toEqual(expected);
    }
  }
});
