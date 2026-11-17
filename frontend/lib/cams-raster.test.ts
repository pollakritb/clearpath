import { describe, it, expect } from "vitest";
import { FORECAST_LEGEND, classifyForecastPm25 } from "./aqi";
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
  it("uses six forecast bands with hard category boundaries", () => {
    for (const band of FORECAST_LEGEND) {
      expect(
        classifyForecastPm25(band.upper === Infinity ? 1000 : band.upper).color,
      ).toBe(band.color);
    }
    expect(classifyForecastPm25(5).color).not.toBe(
      classifyForecastPm25(5.001).color,
    );
    expect(classifyForecastPm25(24.999).color).toBe(
      classifyForecastPm25(25.001).color,
    );
    expect(classifyForecastPm25(NaN).color).toBe("#95a5a6");
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
          Number.parseInt(classifyForecastPm25(10).color.slice(1), 16) >> 16,
          (Number.parseInt(classifyForecastPm25(10).color.slice(1), 16) >> 8) &
            255,
          Number.parseInt(classifyForecastPm25(10).color.slice(1), 16) & 255,
        ].join(","),
        [
          Number.parseInt(classifyForecastPm25(40).color.slice(1), 16) >> 16,
          (Number.parseInt(classifyForecastPm25(40).color.slice(1), 16) >> 8) &
            255,
          Number.parseInt(classifyForecastPm25(40).color.slice(1), 16) & 255,
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
    [0, 1, 4, 5],
    [5.1, 7, 14, 15],
    [15.1, 25, 37.5, 50],
    [50.1, 60, 75, 90],
    [90.1, 100, 120, 140],
    [140.1, 160, 200, 300],
  ]) {
    const pixels = renderCamsPixels({ ...grid, values }, 64, 128);
    const expected = classifyForecastPm25(values[0])
      .color.match(/[a-f0-9]{2}/gi)!
      .map((v) => Number.parseInt(v, 16));
    for (let i = 0; i < pixels.length; i += 4) {
      const rgb = [...pixels.slice(i, i + 3)];
      if (pixels[i + 3] && rgb.join(",") !== "100,116,139")
        expect(rgb).toEqual(expected);
    }
  }
});
