import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useStationTimeline } from "./useStationTimeline";

type Options = Parameters<typeof useStationTimeline>[0];
const station = {
  id: "station",
  name_th: "สถานี",
  lat: 13,
  lon: 100,
  pm25: 20,
  recorded_at: "today",
  data_status: "fresh",
};
function options(): Options {
  return {
    cams: { times: [], requestedAt: null, select: vi.fn(), loading: false },
    mapHistory: {
      stations: [{ ...station, pm25: 10 }],
      loading: false,
      error: "history-error",
    },
    pm25: { stations: [station], loading: false, error: null },
    pauseCams: vi.fn(),
    selectedStation: station,
    selectStation: vi.fn(),
    setDataMode: vi.fn(),
    setHistoryOffsetHours: vi.fn(),
    setHistoryAnchor: vi.fn(),
    setSelectedStation: vi.fn(),
    setSelectedReport: vi.fn(),
    setSelectedPlace: vi.fn(),
    setSelectedStackId: vi.fn(),
  } as unknown as Options;
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("requestAnimationFrame", (cb: () => void) => setTimeout(cb, 0));
  vi.stubGlobal("cancelAnimationFrame", clearTimeout);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("selects observation history and returns to the refreshed station", () => {
  const input = options();
  const { result } = renderHook(() => useStationTimeline(input));
  act(() => result.current.openStationTime("history"));
  expect(result.current.timelineOpen).toBe(true);
  expect(result.current.timelineStation?.pm25).toBe(20);
  expect(input.setHistoryAnchor).toHaveBeenCalled();
  act(() => result.current.selectStationTime({ kind: "history", hours: 3 }));
  expect(input.setHistoryOffsetHours).toHaveBeenCalledWith(3);
  expect(result.current.timelineStation?.pm25).toBe(10);
  expect(result.current.timelineError).toBe("history-error");
  expect(result.current.timelineLoading).toBe(false);
  act(() => result.current.backToStation());
  expect(input.selectStation).toHaveBeenCalledWith(station);
  expect(result.current.timelineOpen).toBe(false);
  expect(input.pauseCams).toHaveBeenCalled();
});
it("aligns forecasts to available CAMS frames, waits for the chosen surface and exposes unavailable data", () => {
  const input = options();
  const at = new Date(Math.floor(Date.now() / 3600000) * 3600000).toISOString();
  input.cams = {
    ...input.cams,
    times: [at],
    requestedAt: "",
    surface: {
      generationId: "g",
      validAt: at,
      latitudes: [13],
      longitudes: [100],
      values: [40],
    },
  };
  const { result, rerender } = renderHook(() => useStationTimeline(input));
  act(() => result.current.openStationTime("forecast"));
  act(() => vi.advanceTimersByTime(1));
  expect(input.cams.select).toHaveBeenCalledWith(at);
  expect(result.current.timelineStation?.pm25).toBe(40);
  expect(result.current.timelineLoading).toBe(false);
  const next = new Date(Date.parse(at) + 3600000).toISOString();
  input.cams = {
    ...input.cams,
    times: [next],
    requestedAt: next,
    surface: null,
    pendingAt: next,
  };
  rerender();
  act(() => vi.advanceTimersByTime(1));
  expect(result.current.timelineTime).toEqual({ kind: "forecast", at: next });
  expect(result.current.timelineLoading).toBe(true);
  expect(result.current.timelineStation?.pm25).toBeNull();
  input.cams = { ...input.cams, unavailable: true };
  rerender();
  expect(result.current.timelineError).toContain("ไม่มีข้อมูล");
  expect(result.current.timelineLoading).toBe(false);
});
it("supports an area timeline without a selected station and a station absent after refresh", () => {
  const input = options();
  input.selectedStation = null;
  const { result, rerender } = renderHook(() => useStationTimeline(input));
  act(() => result.current.openStationTime("history"));
  expect(result.current.timelineStation).toBeNull();
  act(() => result.current.backToStation());
  expect(input.selectStation).not.toHaveBeenCalled();
  input.selectedStation = {
    ...station,
    name_th: null,
    name_en: "English",
  } as unknown as Options["selectedStation"];
  rerender();
  act(() => result.current.openStationTime("history"));
  input.pm25.stations = [];
  rerender();
  expect(result.current.timelineStation?.name).toBe("English");
  expect(result.current.timelineStation?.pm25).toBeNull();
});
