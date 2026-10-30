import { afterEach, expect, it, vi } from "vitest";
import { api } from "./api-client";
import {
  loadGridWindow,
  preparedGridFrames,
  invalidateIncompleteGrid,
} from "./forecast-grid-cache";
import type {
  ForecastGridMetadata,
  ForecastGridFrames,
} from "@/frontend/types";
vi.mock("./api-client", () => ({ api: { forecastGridFrames: vi.fn() } }));
const times = ["2030-01-01T00:00:00Z", "2030-01-01T01:00:00Z"];
const meta = (id: string) =>
  ({
    generation_id: id,
    grid_version: "v1",
    valid_times: times,
    latitudes: [13, 14],
    longitudes: [100, 101],
  }) as ForecastGridMetadata;
const packet = (id: string, timestamps = times): ForecastGridFrames => ({
  generation_id: id,
  grid_version: "v1",
  row_start: 0,
  column_start: 0,
  rows: 2,
  columns: 2,
  frames: timestamps.map((valid_at) => ({
    valid_at,
    values: [10, 20, 30, 40],
  })),
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});
it("retries incomplete timestamps and counts actual usable frames rather than response windows", async () => {
  vi.useFakeTimers();
  const m = meta("partial-retry");
  vi.mocked(api.forecastGridFrames)
    .mockResolvedValueOnce(packet("partial-retry", [times[0]]))
    .mockResolvedValue(packet("partial-retry"));
  const work = loadGridWindow(m, times);
  await vi.advanceTimersByTimeAsync(1000);
  await work;
  expect(api.forecastGridFrames).toHaveBeenCalledTimes(2);
  expect(preparedGridFrames(m)).toBe(2);
});
it("keeps partial coverage honest after three attempts and permits a manual retry", async () => {
  vi.useFakeTimers();
  const m = meta("partial-manual");
  vi.mocked(api.forecastGridFrames).mockResolvedValue(
    packet("partial-manual", [times[0]]),
  );
  const work = loadGridWindow(m, times);
  await vi.advanceTimersByTimeAsync(1000);
  await work;
  expect(api.forecastGridFrames).toHaveBeenCalledTimes(3);
  expect(preparedGridFrames(m)).toBe(1);
  invalidateIncompleteGrid(m);
  vi.mocked(api.forecastGridFrames).mockResolvedValue(packet("partial-manual"));
  await loadGridWindow(m, times);
  expect(preparedGridFrames(m)).toBe(2);
});
it("does not retry an authorization failure", async () => {
  vi.mocked(api.forecastGridFrames).mockRejectedValue(
    Object.assign(Error("denied"), { status: 403 }),
  );
  await expect(loadGridWindow(meta("denied"), times)).rejects.toThrow("denied");
  expect(api.forecastGridFrames).toHaveBeenCalledTimes(1);
});
it("does not claim all-null frames were prepared with usable data", async () => {
  const p = packet("all-null");
  p.frames[0].values = [null, null, null, null];
  vi.mocked(api.forecastGridFrames).mockResolvedValue(p);
  await loadGridWindow(meta("all-null"), times);
  expect(preparedGridFrames(meta("all-null"))).toBe(1);
});
