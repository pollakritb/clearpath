import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api, ApiError } from "@/frontend/lib/api-client";
import { clearPublicDataCache } from "@/frontend/lib/public-data-cache";
import type { ForecastGridMetadata, ForecastResponse } from "@/frontend/types";
import { useForecast } from "./useForecast";

vi.mock("@/frontend/lib/api-client", async (original) => {
  const actual = await original<typeof import("@/frontend/lib/api-client")>();
  return {
    ...actual,
    api: { forecast: vi.fn(), forecastGridMetadata: vi.fn() },
  };
});
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2030-01-01T00:00:00Z"));
  clearPublicDataCache();
  vi.clearAllMocks();
});
afterEach(() => vi.useRealTimers());
const response = (generation: string, expires = "2030-01-01T00:00:10Z") =>
  ({
    generation_id: generation,
    expires_at: expires,
    points: [{ pm25: 12 }],
  }) as ForecastResponse;

it("expires displayed and tab-cached forecasts at the server deadline", async () => {
  vi.mocked(api.forecast)
    .mockResolvedValueOnce(response("one"))
    .mockResolvedValueOnce(response("two", "2030-01-01T00:01:00Z"));
  const { result } = renderHook(() => useForecast());
  await act(async () => {
    await result.current.load("25t");
  });
  expect(result.current.data?.generation_id).toBe("one");
  await act(async () => {
    vi.advanceTimersByTime(10_000);
  });
  expect(result.current.data).toBeNull();
  await act(async () => {
    await result.current.load("25t");
  });
  expect(api.forecast).toHaveBeenCalledTimes(2);
  expect(result.current.data?.generation_id).toBe("two");
});

it("pins cache keys to generation and refreshes a deleted generation once", async () => {
  vi.mocked(api.forecast)
    .mockRejectedValueOnce(new ApiError("gone", 410))
    .mockResolvedValueOnce(response("new"));
  vi.mocked(api.forecastGridMetadata).mockResolvedValue({
    status: "ready",
    generation_id: "new",
  } as ForecastGridMetadata);
  const { result } = renderHook(() => useForecast());
  await act(async () => {
    await result.current.load("25t", 120, false, "old");
  });
  expect(api.forecast).toHaveBeenNthCalledWith(1, "25t", 120, "old");
  expect(api.forecast).toHaveBeenNthCalledWith(2, "25t", 120, "new");
  expect(api.forecastGridMetadata).toHaveBeenCalledTimes(1);
  expect(result.current.data?.generation_id).toBe("new");
});
