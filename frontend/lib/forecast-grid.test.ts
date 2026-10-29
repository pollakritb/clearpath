import type { GridSurface } from "@/frontend/types/ui";
import { describe, it, expect } from "vitest";
import {
  gridValue,
  nearestTime,
  normalizeGridBounds,
  surfaceFor,
  forecastTimes,
} from "./forecast-grid";
import type {
  ForecastGridMetadata,
  ForecastGridFrames,
} from "@/frontend/types";
const surface: GridSurface = {
  latitudes: [13.6, 14],
  longitudes: [100, 100.4],
  values: [10, 20, 30, 40],
  validAt: "2030-01-01T00:00:00Z",
  generationId: "one",
};
describe("CAMS concentration sampler", () => {
  it("matches grid nodes, interpolates values and refuses extrapolation", () => {
    expect(gridValue(surface, 13.6, 100)).toBe(10);
    expect(gridValue(surface, 14, 100.4)).toBe(40);
    expect(gridValue(surface, 13.8, 100.2)).toBeCloseTo(25);
    expect(gridValue(surface, 14.1, 100)).toBeNull();
    expect(gridValue(surface, 4, 100)).toBeNull();
  });
  it("preserves holes while allowing an exact valid node", () => {
    const hole = { ...surface, values: [10, null, 30, 40] };
    expect(gridValue(hole, 13.8, 100.2)).toBeNull();
    expect(gridValue(hole, 13.6, 100)).toBe(10);
    expect(gridValue({ ...surface, values: [0, 0, 0, 0] }, 13.8, 100.2)).toBe(
      0,
    );
  });
  it("clips requests and pins frames to generation and geometry", () => {
    expect(
      normalizeGridBounds({
        min_lat: 0,
        max_lat: 40,
        min_lon: 90,
        max_lon: 120,
      }),
    ).toEqual({ min_lat: 5, max_lat: 21, min_lon: 97, max_lon: 106 });
    expect(
      normalizeGridBounds({
        min_lat: 40,
        max_lat: 41,
        min_lon: 100,
        max_lon: 101,
      }),
    ).toBeNull();
    const meta = {
      generation_id: "one",
      grid_version: "v1",
      latitudes: [13.6, 14],
      longitudes: [100, 100.4],
    } as ForecastGridMetadata;
    const data = {
      generation_id: "two",
      grid_version: "v1",
      row_start: 0,
      column_start: 0,
      rows: 2,
      columns: 2,
      frames: [{ valid_at: surface.validAt, values: surface.values }],
    } as ForecastGridFrames;
    expect(surfaceFor(meta, data, surface.validAt)).toBeNull();
    data.generation_id = "one";
    expect(surfaceFor(meta, data, surface.validAt)?.values).toEqual(
      surface.values,
    );
  });
  it("keeps actual current/future timestamps and chooses the closest available", () => {
    const times = [
      "2030-01-01T00:00:00Z",
      "2030-01-01T01:00:00Z",
      "2030-01-01T03:00:00Z",
    ];
    expect(
      forecastTimes(
        { valid_times: times } as ForecastGridMetadata,
        Date.parse("2030-01-01T01:30Z"),
      ),
    ).toEqual(times.slice(1));
    expect(nearestTime(times, "2030-01-01T02:45Z")).toBe(times[2]);
    expect(nearestTime([], 0)).toBeNull();
  });
});
