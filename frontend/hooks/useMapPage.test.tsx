import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type {
  CommunityReport,
  CommunityReportStack,
  LocationSuggestion,
  MeasurementRequestView,
  Station,
} from "@/frontend/types";
import { useMapPage, type MapPageOptions } from "./useMapPage";

const data = vi.hoisted(() => ({
  detail: vi.fn(),
  pm25: { stations: [] as Station[], refresh: vi.fn(async () => undefined) },
  community: {
    reports: [] as CommunityReport[],
    stacks: [] as CommunityReportStack[],
    demoMode: false,
    refresh: vi.fn(async () => undefined),
  },
  firms: { fires: [], loaded: false, load: vi.fn(async () => undefined) },
  history: {
    stations: [] as Station[],
    reports: [] as CommunityReport[],
    stacks: [] as CommunityReportStack[],
    load: vi.fn(),
    clear: vi.fn(),
  },
  requests: { rows: [] as MeasurementRequestView[], now: 0 },
  location: {
    location: null as { lat: number; lon: number; accuracy: number } | null,
  },
  owned: { ready: true, ids: new Set<string>() },
  cams: { pause: vi.fn(), now: vi.fn() },
}));
vi.mock("@/frontend/components/auth/AuthProvider", () => ({
  useCurrentUserId: () => "viewer",
}));
vi.mock("@/frontend/lib/api-client", () => ({
  api: {
    reportDetail: data.detail,
    placeReportSelection: vi.fn(async () => ({ report_ids: [] })),
  },
  apiErrorMessage: (_: unknown, fallback: string) => fallback,
}));
vi.mock("./usePm25", () => ({ usePm25: () => data.pm25 }));
vi.mock("./useCommunity", () => ({
  useCommunityMapData: () => data.community,
}));
vi.mock("./useFirms", () => ({
  useFirms: () => data.firms,
  FIRMS_REFRESH_MS: 1000,
}));
vi.mock("./useMapHistory", () => ({ useMapHistory: () => data.history }));
vi.mock("./useMeasurementRequests", () => ({
  useMeasurementRequests: () => data.requests,
}));
vi.mock("./useCurrentLocation", () => ({
  useCurrentLocation: () => data.location,
}));
vi.mock("./useOwnedReportIds", () => ({ useOwnedReportIds: () => data.owned }));
vi.mock("./useForecastGrid", () => ({ useForecastGrid: () => ({}) }));
vi.mock("./useCamsPresentation", () => ({
  useCamsPresentation: () => data.cams,
}));
vi.mock("./useRequestPlaceLabel", () => ({
  useRequestPlaceLabel: (point: unknown) => ({ point }),
}));

const station = {
  id: "station",
  lat: 13.8,
  lon: 100.1,
  pm25: 20,
  in_service_area: true,
  data_status: "fresh",
  eligible_for_surface: true,
} as Station;
const report = {
  id: "report",
  user_id: "author",
  lat: 13.8,
  lon: 100.101,
  pm25: 30,
  status: "approved",
  source_type: "individual",
} as CommunityReport;
const stack = {
  id: "stack",
  lat: 13.8,
  lon: 100.1,
  report_ids: ["report", "missing"],
} as CommunityReportStack;
const place = {
  id: "place",
  lat: 13.8,
  lon: 100.1,
  name: "สถานที่",
} as LocationSuggestion;
const request = {
  id: "REQ-000001",
  lat: 13.8,
  lon: 100.1,
  status: "active",
  radius_km: 3,
} as MeasurementRequestView;
const flush = () => act(() => vi.advanceTimersByTime(20));

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    window.setTimeout(() => callback(0), 0),
  );
  vi.stubGlobal("cancelAnimationFrame", window.clearTimeout);
  const now = new Date().toISOString();
  data.pm25.stations = [
    { ...station, recorded_at: now },
    { ...station, id: "outside", in_service_area: false },
  ];
  data.community.reports = [{ ...report, captured_at: now }];
  data.community.stacks = [stack];
  data.community.demoMode = false;
  data.requests.now = Date.now();
  data.requests.rows = [
    { ...request, expires_at: new Date(Date.now() + 3600000).toISOString() },
  ];
  data.history.stations = [station];
  data.history.reports = [report];
  data.history.stacks = [stack];
  data.location.location = { lat: 13.8, lon: 100.1, accuracy: 10 };
  data.owned.ready = true;
  data.owned.ids = new Set();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("keeps one selected target, preserves place/stack context and excludes owned reports from the nearest reading", () => {
  const { result, rerender } = renderHook(() => useMapPage({}));
  expect(result.current.serviceAreaStations).toHaveLength(1);
  expect(result.current.heatmapPoint?.id).toBe("station");
  act(() => result.current.selectStation(station));
  expect(result.current.selectedStation?.id).toBe("station");
  act(() => result.current.selectReport(report));
  expect(result.current.selectedStation).toBeNull();
  expect(result.current.selectedReport?.id).toBe("report");
  act(() => result.current.selectStack(stack));
  expect(result.current.selectedReport).toBeNull();
  expect(result.current.selectedStackReports).toHaveLength(1);
  act(() => result.current.setSelectedPlace(place));
  expect(result.current.placeAir?.method).toBe("idw");
  expect(result.current.mapStacks).toEqual([]);
  expect(result.current.mapStations).toHaveLength(1);
  expect(result.current.mapReports).toHaveLength(1);
  act(() => result.current.selectRequest(data.requests.rows[0]));
  expect(result.current.selectedPlace).toBeNull();
  expect(result.current.selectedStack).toBeNull();
  expect(result.current.selectedRequest?.id).toBe(request.id);
  act(() => window.dispatchEvent(new Event("cp-community-reset")));
  expect(result.current.selectedRequest).toBeNull();
  data.pm25.stations = [];
  data.owned.ids = new Set([report.id]);
  rerender();
  expect(result.current.heatmapPoint).toBeNull();
  data.owned.ready = false;
  rerender();
  expect(result.current.heatmapPoint).toBeNull();
});

it("restores history when leaving CAMS, pauses on hidden pages/panels, and polls active layers only", () => {
  const { result, rerender } = renderHook(
    (options: MapPageOptions) => useMapPage(options),
    { initialProps: { showFiresInitially: true } as MapPageOptions },
  );
  flush();
  expect(data.firms.load).toHaveBeenCalledWith(1);
  act(() => vi.advanceTimersByTime(1000));
  expect(data.firms.load).toHaveBeenCalledWith(1, true);
  act(() => result.current.setHistoryEnabled(true));
  act(() => vi.advanceTimersByTime(250));
  expect(data.history.load).toHaveBeenCalled();
  expect(result.current.mapReports).toEqual(data.history.reports);
  expect(result.current.mapStacks).toEqual(data.history.stacks);
  act(() => result.current.selectStack(stack));
  expect(result.current.selectedStack?.id).toBe(stack.id);
  act(() => result.current.changeCams());
  expect(result.current.camsEnabled).toBe(true);
  expect(data.cams.now).toHaveBeenCalled();
  act(() => result.current.onPanelChange(true));
  expect(result.current.panelOpen).toBe(true);
  act(() => result.current.onPanelChange(false));
  act(() => result.current.changeCams());
  expect(result.current.historyEnabled).toBe(true);
  act(() => result.current.refresh());
  expect(data.pm25.refresh).toHaveBeenCalled();
  expect(data.community.refresh).toHaveBeenCalled();
  act(() => result.current.startRequest());
  expect(result.current.requestStep).toBe("search");
  expect(result.current.historyEnabled).toBe(false);
  rerender({ active: false });
  flush();
  expect(data.cams.pause).toHaveBeenCalled();
});

it("opens each report/request deep link once, ignores completed requests and resets link guards", async () => {
  const { result, rerender } = renderHook(
    (options: MapPageOptions) => useMapPage(options),
    { initialProps: { initialReportId: "missing" } as MapPageOptions },
  );
  flush();
  expect(result.current.selectedReport).toBeNull();
  rerender({ initialReportId: report.id });
  flush();
  await act(async () => {
    await Promise.resolve();
  });
  expect(result.current.selectedReport?.id).toBe(report.id);
  rerender({ initialReportId: report.id });
  flush();
  rerender({ initialRequestId: request.id });
  flush();
  expect(result.current.selectedRequest?.id).toBe(request.id);
  data.requests.rows = [{ ...data.requests.rows[0], status: "fulfilled" }];
  rerender({ initialRequestId: request.id });
  flush();
  expect(result.current.selectedRequest).toBeNull();
  rerender({ initialReportId: null, initialRequestId: null, active: false });
  flush();
  rerender({ initialRequestId: "missing", active: true });
  flush();
  expect(result.current.selectedRequest).toBeNull();
});

it("opens the request flow once, keeps current mode for direct CAMS requests and supports missing GPS/demo focus", () => {
  data.location.location = null;
  data.community.demoMode = true;
  const { result, rerender } = renderHook(
    (options: MapPageOptions) => useMapPage(options),
    {
      initialProps: {
        requestInitially: true,
        initialCams: true,
      } as MapPageOptions,
    },
  );
  flush();
  expect(result.current.requestStep).toBe("search");
  expect(result.current.camsEnabled).toBe(true);
  expect(result.current.heatmapPoint).toBeNull();
  expect(result.current.heatmapDistanceKm).toBeNull();
  expect(result.current.effectiveFocusPoint).not.toBeNull();
  rerender({ requestInitially: true, initialCams: true });
  flush();
  act(() => result.current.selectRequest(data.requests.rows[0]));
  act(() => result.current.selectRequest(data.requests.rows[0]));
  act(() => result.current.setSelectedPlace(place));
  act(() => vi.advanceTimersByTime(60000));
  act(() => result.current.refresh());
  expect(data.firms.load).not.toHaveBeenCalled();
  rerender({ requestInitially: false });
  flush();
});

it("loads old report links separately from the fresh feed and reports failures", async () => {
  data.detail.mockResolvedValue({
    ...report,
    id: "old-report",
    is_fresh: false,
  });
  const { result, rerender } = renderHook(
    (options: MapPageOptions) => useMapPage(options),
    { initialProps: { initialReportId: "old-report" } },
  );
  await act(async () => {
    await Promise.resolve();
  });
  expect(result.current.selectedReport?.id).toBe("old-report");
  expect(data.community.reports.some((row) => row.id === "old-report")).toBe(
    false,
  );
  data.detail.mockRejectedValue(new Error("missing"));
  rerender({ initialReportId: "not-published" });
  await act(async () => {
    await Promise.resolve();
  });
  expect(result.current.reportLinkError).toBeTruthy();
});
