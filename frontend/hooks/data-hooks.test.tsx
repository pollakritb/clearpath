import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  activities: vi.fn(),
  announcements: vi.fn(),
  communityReports: vi.fn(),
  firms: vi.fn(),
  forecast: vi.fn(),
  history: vi.fn(),
  leaderboard: vi.fn(),
  pm25Current: vi.fn(),
  weather: vi.fn(),
}));

const realtimeMocks = vi.hoisted(() => ({ client: null as unknown }));

vi.mock("@/frontend/lib/api-client", () => ({
  api: apiMocks,
  apiErrorMessage: (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback,
}));

vi.mock("@/frontend/lib/supabase", () => ({
  getSupabaseBrowserClient: () => realtimeMocks.client,
}));

import { useAnnouncements, useCommunityMapData } from "./useCommunity";
import { useFirms } from "./useFirms";
import { useForecast } from "./useForecast";
import { useHistory } from "./useHistory";
import { usePm25 } from "./usePm25";
import { useWeather } from "./useWeather";
import { clearPublicDataCache } from "@/frontend/lib/public-data-cache";

const stationsResponse = {
  source: "air4thai",
  updated_at: "2026-09-16T00:00:00Z",
  count: 1,
  fresh_count: 1,
  delayed_count: 0,
  expired_count: 0,
  stations: [{ id: "station-1", pm25: 12 }],
};

describe("data hooks", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    realtimeMocks.client = null;
    clearPublicDataCache();
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    apiMocks.pm25Current.mockResolvedValue(stationsResponse);
    apiMocks.communityReports.mockResolvedValue({ reports: [], count: 0 });
    apiMocks.announcements.mockResolvedValue({ announcements: [], count: 0 });
    apiMocks.activities.mockResolvedValue({ activities: [], count: 0 });
    apiMocks.leaderboard.mockResolvedValue({ users: [], count: 0 });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("loads station freshness counts and exposes refresh failures", async () => {
    const { result } = renderHook(() => usePm25());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.stations).toHaveLength(1);
    expect(result.current.counts).toEqual({ fresh: 1, delayed: 0, expired: 0 });

    apiMocks.pm25Current.mockRejectedValueOnce(new Error("station offline"));
    await act(async () => result.current.refresh());
    expect(result.current.error).toBe("station offline");
  });

  it("reuses fresh public data across page remounts and still honors manual refresh", async () => {
    const first = renderHook(() => usePm25());
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    first.unmount();

    const second = renderHook(() => usePm25());
    expect(second.result.current.loading).toBe(false);
    expect(second.result.current.stations).toHaveLength(1);
    await act(async () => {});
    expect(apiMocks.pm25Current).toHaveBeenCalledTimes(1);

    await act(async () => second.result.current.refresh());
    expect(apiMocks.pm25Current).toHaveBeenCalledTimes(2);
  });

  it("refreshes Supabase-backed stations while visible without a loading flash", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => usePm25());
    await act(async () => {});
    expect(result.current.loading).toBe(false);

    apiMocks.pm25Current.mockResolvedValue({
      ...stationsResponse,
      updated_at: "2026-09-16T00:30:00Z",
    });
    await act(async () => vi.advanceTimersByTimeAsync(5 * 60 * 1000));
    expect(apiMocks.pm25Current).toHaveBeenCalledTimes(2);
    expect(result.current.updatedAt).toBe("2026-09-16T00:30:00Z");
    expect(result.current.loading).toBe(false);

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    await act(async () => vi.advanceTimersByTimeAsync(5 * 60 * 1000));
    expect(apiMocks.pm25Current).toHaveBeenCalledTimes(2);

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    await act(async () =>
      document.dispatchEvent(new Event("visibilitychange")),
    );
    expect(apiMocks.pm25Current).toHaveBeenCalledTimes(3);
  });

  it("loads and clears forecast, weather, and history states", async () => {
    apiMocks.forecast.mockResolvedValue({ station_id: "station-1" });
    apiMocks.weather.mockResolvedValue({ temperature: 30 });
    apiMocks.history.mockResolvedValue({ points: [{ pm25: 10 }] });

    const forecast = renderHook(() => useForecast());
    const weather = renderHook(() => useWeather());
    const history = renderHook(() => useHistory());

    await act(async () => forecast.result.current.load("station-1", 6));
    await act(async () => weather.result.current.load(13.8, 100.1));
    await act(async () => history.result.current.load("station-1", 48));

    expect(forecast.result.current.data).toEqual({ station_id: "station-1" });
    expect(weather.result.current.data).toEqual({ temperature: 30 });
    expect(history.result.current.points).toEqual([{ pm25: 10 }]);
    expect(history.result.current.stationId).toBe("station-1");

    act(() => history.result.current.clear());
    expect(history.result.current.points).toEqual([]);
    expect(history.result.current.stationId).toBeNull();
  });

  it("normalizes forecast, weather, and history request failures", async () => {
    apiMocks.forecast.mockRejectedValue(new Error("forecast failed"));
    apiMocks.weather.mockRejectedValue(new Error("weather failed"));
    apiMocks.history.mockRejectedValue(new Error("history failed"));

    const forecast = renderHook(() => useForecast());
    const weather = renderHook(() => useWeather());
    const history = renderHook(() => useHistory());

    await act(async () => forecast.result.current.load("station-1"));
    await act(async () => weather.result.current.load(13.8, 100.1));
    await act(async () => history.result.current.load("station-1"));

    expect(forecast.result.current.error).toBe("forecast failed");
    expect(weather.result.current.error).toBe("weather failed");
    expect(history.result.current.error).toBe("history failed");
  });

  it("distinguishes available, unavailable, and failed satellite data", async () => {
    const { result } = renderHook(() => useFirms());
    apiMocks.firms.mockResolvedValueOnce({
      fires: [{ id: "hotspot-1" }],
      available: true,
      status: "available",
      checked_at: "2026-09-16T12:00:00Z",
      latest_acquired_at: "2026-09-16T11:00:00Z",
      max_age_hours: 12,
      message: null,
    });
    await act(async () => result.current.load(2));
    expect(result.current.fires).toHaveLength(1);
    expect(result.current.loaded).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.status).toBe("available");

    apiMocks.firms.mockResolvedValueOnce({
      fires: [],
      available: false,
      status: "unavailable",
      checked_at: "2026-09-16T12:00:00Z",
      latest_acquired_at: null,
      max_age_hours: 12,
      message: "provider unavailable",
    });
    await act(async () => result.current.load(1, true));
    expect(result.current.error).toBeNull();
    expect(result.current.status).toBe("unavailable");
    expect(result.current.message).toBe("provider unavailable");

    apiMocks.firms.mockRejectedValueOnce(new Error("satellite failed"));
    await act(async () => result.current.load(1, true));
    expect(result.current.error).toBe("satellite failed");
    expect(result.current.status).toBe("failed");
  });

  it("loads public reports and reports refresh failures", async () => {
    apiMocks.communityReports.mockResolvedValueOnce({
      reports: [{ id: "report-1" }],
      count: 1,
    });
    const { result } = renderHook(() => useCommunityMapData());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.reports).toEqual([{ id: "report-1" }]);
    apiMocks.communityReports.mockRejectedValueOnce(
      new Error("reports failed"),
    );
    await act(async () => result.current.refresh());
    expect(result.current.error).toBe("reports failed");
  });

  it("restores map and news data immediately when their pages remount", async () => {
    const firstMap = renderHook(() => useCommunityMapData());
    const firstNews = renderHook(() => useAnnouncements());
    await waitFor(() => expect(firstMap.result.current.loading).toBe(false));
    await waitFor(() => expect(firstNews.result.current.loading).toBe(false));
    firstMap.unmount();
    firstNews.unmount();

    const secondMap = renderHook(() => useCommunityMapData());
    const secondNews = renderHook(() => useAnnouncements());
    expect(secondMap.result.current.loading).toBe(false);
    expect(secondNews.result.current.loading).toBe(false);
    await act(async () => {});
    expect(apiMocks.communityReports).toHaveBeenCalledTimes(1);
    expect(apiMocks.announcements).toHaveBeenCalledTimes(1);
  });

  it("uses separate Realtime channels for concurrent map hooks", async () => {
    const channels = new Map<string, object>();
    const client = {
      channel: vi.fn((topic: string) => {
        const existing = channels.get(topic);
        if (existing) return existing;
        const channel = { on: vi.fn(), subscribe: vi.fn() };
        channel.on.mockImplementation(() => {
          if (channel.subscribe.mock.calls.length > 0) {
            throw new Error("cannot add postgres_changes after subscribe");
          }
          return channel;
        });
        channel.subscribe.mockImplementation(() => channel);
        channels.set(topic, channel);
        return channel;
      }),
      removeChannel: vi.fn(async () => "ok"),
    };
    realtimeMocks.client = client;

    const map = renderHook(() => useCommunityMapData());
    const secondMap = renderHook(() => useCommunityMapData());
    expect(client.channel).toHaveBeenCalledTimes(2);
    expect(
      new Set(client.channel.mock.calls.map(([topic]) => topic)).size,
    ).toBe(2);
    map.unmount();
    secondMap.unmount();
    expect(client.removeChannel).toHaveBeenCalledTimes(2);
  });

  it("reuses weather and forecast for the same station but not on forced refresh", async () => {
    apiMocks.weather.mockResolvedValue({ temperature: 30 });
    apiMocks.forecast.mockResolvedValue({ station_id: "station-1" });
    const firstWeather = renderHook(() => useWeather());
    const firstForecast = renderHook(() => useForecast());
    await act(async () => firstWeather.result.current.load(13.8, 100.1));
    await act(async () => firstForecast.result.current.load("station-1", 24));
    firstWeather.unmount();
    firstForecast.unmount();

    const nextWeather = renderHook(() => useWeather());
    const nextForecast = renderHook(() => useForecast());
    await act(async () => nextWeather.result.current.load(13.8, 100.1));
    await act(async () => nextForecast.result.current.load("station-1", 24));
    expect(apiMocks.weather).toHaveBeenCalledTimes(1);
    expect(apiMocks.forecast).toHaveBeenCalledTimes(1);

    await act(async () => nextWeather.result.current.load(13.8, 100.1, true));
    await act(async () =>
      nextForecast.result.current.load("station-1", 24, true),
    );
    expect(apiMocks.weather).toHaveBeenCalledTimes(2);
    expect(apiMocks.forecast).toHaveBeenCalledTimes(2);
  });

  it("loads announcements defensively", async () => {
    apiMocks.announcements.mockResolvedValueOnce({
      announcements: [{ id: "announcement-1" }],
      count: 1,
    });
    apiMocks.activities.mockResolvedValueOnce({
      activities: [{ id: "activity-1" }],
      count: 1,
    });
    apiMocks.leaderboard.mockResolvedValueOnce({
      users: [{ user_id: "user-1" }],
      count: 1,
    });

    const announcements = renderHook(() => useAnnouncements());
    await waitFor(() =>
      expect(announcements.result.current.loading).toBe(false),
    );
    expect(announcements.result.current.announcements).toHaveLength(1);

    apiMocks.announcements.mockRejectedValueOnce(new Error("news failed"));
    await act(async () => announcements.result.current.refresh());
    expect(announcements.result.current.error).toBe("news failed");
  });
});
