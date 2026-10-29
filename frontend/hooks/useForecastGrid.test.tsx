import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ForecastGridMetadata,
  ForecastGridFrames,
} from "@/frontend/types";
import { api } from "@/frontend/lib/api-client";
import { useForecastGrid } from "./useForecastGrid";
vi.mock("@/frontend/lib/api-client", () => ({
  api: { forecastGridMetadata: vi.fn(), forecastGridFrames: vi.fn() },
  apiErrorMessage: (_e: unknown, f: string) => f,
}));
const now = Date.parse("2030-01-01T00:20Z");
function meta(id = "hook-grid"): ForecastGridMetadata {
  return {
    status: "ready",
    generation_id: id,
    grid_version: "v1",
    provider: "openmeteo_cams",
    domain: "cams_global",
    unit: "µg/m³",
    retrieved_at: "2030-01-01T00:00Z",
    retrieval_started_at: "2030-01-01T00:00Z",
    model_issued_at: null,
    stale: false,
    latitudes: [13.6, 14],
    longitudes: [100, 100.4],
    valid_times: Array.from({ length: 12 }, (_, i) =>
      new Date(Date.parse("2030-01-01T00:00Z") + i * 3600000).toISOString(),
    ),
    bounds: [5, 97, 21, 106],
    native_resolution_degrees: 0.4,
    native_time_step_hours: 3,
    attribution: "CAMS",
    attribution_url: "https://open-meteo.com",
  };
}
function packet(
  generation: string,
  start: string,
  end: string,
): ForecastGridFrames {
  const times = meta().valid_times.filter((t) => t >= start && t <= end);
  return {
    generation_id: generation,
    grid_version: "v1",
    row_start: 0,
    column_start: 0,
    rows: 2,
    columns: 2,
    frames: times.map((valid_at) => ({ valid_at, values: [10, 20, 30, 40] })),
  };
}
async function advance(ms = 250) {
  await act(async () => {});
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.clearAllMocks();
  vi.mocked(api.forecastGridMetadata).mockResolvedValue(meta());
  vi.mocked(api.forecastGridFrames).mockImplementation(async (g, s, e) =>
    packet(g, s, e),
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
describe("stored forecast grid loading", () => {
  it("loads lazily, reuses six-frame windows, keeps selection on reopen and stops when inactive", async () => {
    const { result, rerender } = renderHook(
      ({ enabled, active }) => useForecastGrid(enabled, active, null),
      { initialProps: { enabled: false, active: true } },
    );
    await advance();
    expect(api.forecastGridMetadata).not.toHaveBeenCalled();
    rerender({ enabled: true, active: true });
    await advance();
    expect(result.current.surface?.values[0]).toBe(10);
    expect(api.forecastGridFrames).toHaveBeenCalledTimes(1);
    act(() => result.current.select(meta().valid_times[2]));
    await advance();
    expect(api.forecastGridFrames).toHaveBeenCalledTimes(1);
    act(() => result.current.togglePlay());
    await advance(1500);
    expect(result.current.at).toBe(meta().valid_times[3]);
    rerender({ enabled: true, active: false });
    await advance();
    expect(result.current.playing).toBe(false);
    expect(result.current.surface).toBeNull();
    rerender({ enabled: true, active: true });
    await advance();
    expect(result.current.at).toBe(meta().valid_times[3]);
    expect(result.current.playing).toBe(false);
  });
  it("ignores late old viewport/time responses and retries errors", async () => {
    vi.mocked(api.forecastGridMetadata).mockResolvedValue(meta("racing-grid"));
    let resolveOld: (v: ForecastGridFrames) => void = () => {};
    vi.mocked(api.forecastGridFrames)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOld = resolve;
          }),
      )
      .mockImplementation(async (g, s, e) => packet(g, s, e));
    const { result } = renderHook(() => useForecastGrid(true, true, null));
    await advance();
    act(() => result.current.select(meta().valid_times[8]));
    await advance();
    expect(result.current.surface?.validAt).toBe(meta().valid_times[8]);
    await act(async () =>
      resolveOld(
        packet("racing-grid", meta().valid_times[0], meta().valid_times[5]),
      ),
    );
    expect(result.current.at).toBe(meta().valid_times[8]);
    act(() => result.current.now());
    await advance();
    expect(result.current.at).toBe(meta().valid_times[0]);
  });
  it("handles metadata failure, unavailable data and an out-of-coverage viewport", async () => {
    vi.mocked(api.forecastGridMetadata).mockRejectedValueOnce(
      new Error("offline"),
    );
    const { result, rerender } = renderHook(
      ({ bounds }) => useForecastGrid(true, true, bounds),
      {
        initialProps: {
          bounds: { min_lat: 40, max_lat: 42, min_lon: 100, max_lon: 101 },
        },
      },
    );
    await advance();
    expect(result.current.error).toContain("ไม่สำเร็จ");
    act(() => result.current.retry());
    await advance();
    expect(result.current.outOfBounds).toBe(true);
    rerender({
      bounds: { min_lat: 13.6, max_lat: 14, min_lon: 100, max_lon: 100.4 },
    });
    await advance();
    expect(result.current.surface).not.toBeNull();
    act(() => result.current.pause());
    expect(result.current.playing).toBe(false);
  });
  it("does not mix generations and surfaces frame errors", async () => {
    vi.mocked(api.forecastGridMetadata).mockResolvedValue(
      meta("mismatch-grid"),
    );
    vi.mocked(api.forecastGridFrames).mockResolvedValue(
      packet("different", meta().valid_times[0], meta().valid_times[5]),
    );
    const { result } = renderHook(() => useForecastGrid(true, true, null));
    await advance();
    expect(result.current.surface).toBeNull();
    expect(result.current.error).toBeTruthy();
  });
});

it("refreshes metadata on return, switches generations atomically and discloses a moved timestamp", async () => {
  const first = meta("old-generation");
  vi.mocked(api.forecastGridMetadata).mockResolvedValueOnce(first);
  const { result, rerender } = renderHook(
    ({ active }) => useForecastGrid(true, active, null),
    { initialProps: { active: true } },
  );
  await advance();
  act(() => result.current.select(first.valid_times[2]));
  await advance();
  rerender({ active: false });
  await advance();
  const next = {
    ...meta("new-generation"),
    valid_times: first.valid_times.slice(4),
  };
  vi.mocked(api.forecastGridMetadata).mockResolvedValueOnce(next);
  rerender({ active: true });
  await advance();
  await advance();
  expect(result.current.meta?.generation_id).toBe("new-generation");
  expect(result.current.at).toBe(first.valid_times[4]);
  expect(result.current.notice).toContain("ไม่มีเวลาเดิม");
  expect(result.current.surface?.generationId).toBe("new-generation");
});

it("reports a missing complete frame without a perpetual loading indicator", async () => {
  vi.mocked(api.forecastGridMetadata).mockResolvedValue(meta("empty-frame"));
  vi.mocked(api.forecastGridFrames).mockResolvedValue({
    ...packet("empty-frame", meta().valid_times[0], meta().valid_times[5]),
    frames: [],
  });
  const { result } = renderHook(() => useForecastGrid(true, true, null));
  await advance();
  expect(result.current.loading).toBe(false);
  expect(result.current.noFrame).toBe(true);
});
