import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, apiErrorMessage } from "@/frontend/lib/api-client";
import type { MapHistoryResponse, Station } from "@/frontend/types";
import { useMapHistory } from "./useMapHistory";

vi.mock("@/frontend/lib/api-client", () => ({
  api: { mapHistory: vi.fn() },
  apiErrorMessage: vi.fn((_error: unknown, fallback: string) => fallback),
}));

const firstTime = new Date("2026-10-05T09:00:00Z");
const secondTime = new Date("2026-10-05T10:00:00Z");
const firstStation = { id: "station-1" } as Station;
const secondStation = { id: "station-2" } as Station;
const history = (
  stations: Station[],
  target_at: string,
): MapHistoryResponse => ({
  stations,
  target_at,
  source: "air4thai",
  count: stations.length,
  max_age_minutes: 60,
});

describe("useMapHistory", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it("loads stations for the requested historical hour", async () => {
    vi.mocked(api.mapHistory).mockResolvedValue(
      history([firstStation], firstTime.toISOString()),
    );
    const { result } = renderHook(useMapHistory);

    await act(async () => result.current.load(firstTime));

    expect(api.mapHistory).toHaveBeenCalledWith(firstTime.toISOString());
    expect(result.current).toMatchObject({
      stations: [firstStation],
      targetAt: firstTime.toISOString(),
      loading: false,
      error: null,
    });
  });

  it("clears stale data and shows a useful error on failure", async () => {
    vi.mocked(api.mapHistory).mockRejectedValue(new Error("offline"));
    const { result } = renderHook(useMapHistory);

    await act(async () => result.current.load(firstTime));

    expect(result.current.stations).toEqual([]);
    expect(result.current.targetAt).toBe(firstTime.toISOString());
    expect(result.current.error).toBe("โหลดค่าฝุ่นย้อนหลังไม่สำเร็จ");
    expect(result.current.loading).toBe(false);
    expect(apiErrorMessage).toHaveBeenCalledOnce();
  });

  it("ignores an older response after a newer request completes", async () => {
    let finishFirst!: (value: MapHistoryResponse) => void;
    vi.mocked(api.mapHistory)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishFirst = resolve;
          }),
      )
      .mockResolvedValueOnce(
        history([secondStation], secondTime.toISOString()),
      );
    const { result } = renderHook(useMapHistory);

    act(() => {
      void result.current.load(firstTime);
      void result.current.load(secondTime);
    });
    await act(async () => {});
    expect(result.current.stations).toEqual([secondStation]);

    await act(async () =>
      finishFirst(history([firstStation], firstTime.toISOString())),
    );
    expect(result.current.stations).toEqual([secondStation]);
    expect(result.current.targetAt).toBe(secondTime.toISOString());
  });

  it("invalidates an in-flight request when returning to current data", async () => {
    let finish!: (value: MapHistoryResponse) => void;
    vi.mocked(api.mapHistory).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { result } = renderHook(useMapHistory);

    act(() => void result.current.load(firstTime));
    expect(result.current.loading).toBe(true);
    act(() => result.current.clear());
    expect(result.current).toMatchObject({
      stations: [],
      targetAt: null,
      loading: false,
      error: null,
    });

    await act(async () =>
      finish(history([firstStation], firstTime.toISOString())),
    );
    expect(result.current.stations).toEqual([]);
    expect(result.current.targetAt).toBeNull();
  });
});
