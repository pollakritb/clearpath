import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "@/frontend/lib/api-client";
import { useHistory } from "./useHistory";
vi.mock("@/frontend/lib/api-client", () => ({
  api: { history: vi.fn() },
  apiErrorMessage: (_error: unknown, fallback: string) => fallback,
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
const response = (pm25: number) => ({
  station_id: "test",
  points: [{ pm25, recorded_at: "2026-11-12T01:00:00Z", aqi: null }],
});
it("keeps the latest station's points when an older request finishes late", async () => {
  let finish!: (value: ReturnType<typeof response>) => void;
  vi.mocked(api.history)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValueOnce(response(20));
  const { result } = renderHook(useHistory);
  act(() => {
    void result.current.load("A");
    void result.current.load("B");
  });
  await act(async () => {});
  await act(async () => finish(response(100)));
  expect(result.current.stationId).toBe("B");
  expect(result.current.points[0].pm25).toBe(20);
  expect(result.current.loading).toBe(false);
  expect(vi.mocked(api.history).mock.calls[0][3]?.aborted).toBe(true);
});
it("invalidates success and errors after clear, including loading", async () => {
  let finish!: (value: ReturnType<typeof response>) => void;
  vi.mocked(api.history).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { result } = renderHook(useHistory);
  act(() => void result.current.load("A"));
  act(() => result.current.clear());
  expect(result.current.loading).toBe(false);
  await act(async () => finish(response(100)));
  expect(result.current.stationId).toBeNull();
  expect(result.current.points).toEqual([]);
  expect(result.current.reference).toBeNull();
});
it("does not let a stale rejection clear a successful newer station", async () => {
  let fail!: (e: Error) => void;
  vi.mocked(api.history)
    .mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject;
        }),
    )
    .mockResolvedValueOnce(response(30));
  const { result } = renderHook(useHistory);
  act(() => {
    void result.current.load("A");
    void result.current.load("B");
  });
  await act(async () => {});
  await act(async () => fail(new Error("offline")));
  expect(result.current.points[0].pm25).toBe(30);
  expect(result.current.error).toBeNull();
});
