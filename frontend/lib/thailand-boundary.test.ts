import { expect, it } from "vitest";
import { isInThailand, THAILAND_CLIP_PATH } from "./thailand-boundary";

it("keeps mainland Thailand and island polygons", () => {
  for (const [lat, lon] of [
    [13.7563, 100.5018], // Bangkok
    [18.7883, 98.9853], // Chiang Mai
    [6.5, 101.2], // southern mainland
    [7.88, 98.35], // Phuket
    [9.5, 100.0], // Ko Samui
    [12.04, 102.31], // Ko Chang
  ])
    expect(isInThailand(lat, lon), `${lat},${lon}`).toBe(true);
});

it("excludes neighboring countries and sea inside the old rectangular raster", () => {
  for (const [lat, lon] of [
    [16.85, 96.2], // Myanmar
    [16.5, 98.0], // Myanmar inside raster bounds
    [17.9757, 102.6331], // Vientiane, Laos
    [13.36, 103.86], // Siem Reap, Cambodia
    [6.12, 100.37], // Alor Setar, Malaysia
    [10, 101], // Gulf of Thailand
    [NaN, 100],
  ])
    expect(isInThailand(lat, lon), `${lat},${lon}`).toBe(false);
});

it("projects every polygon into a closed Web Mercator clip without invalid values", () => {
  expect(THAILAND_CLIP_PATH.match(/M/g)).toHaveLength(20);
  expect(THAILAND_CLIP_PATH.match(/Z/g)).toHaveLength(20);
  expect(THAILAND_CLIP_PATH).not.toMatch(/NaN|Infinity/);
  expect(THAILAND_CLIP_PATH).toMatch(/^M[\d.,-]+L/);
});
