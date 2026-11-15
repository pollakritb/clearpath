import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { CommunityReport } from "@/frontend/types";
import { useReportImage } from "./useReportImage";
const detail = vi.hoisted(() => vi.fn());
vi.mock("@/frontend/lib/api-client", () => ({ api: { reportDetail: detail } }));
const base = {
  id: "report",
  image_url: "/api/community/report-images/report?expires=1300",
} as CommunityReport;
const publicRead = vi.fn(async () => undefined);
const historyRead = vi.fn(async () => undefined);
const options = {
  report: base,
  active: true,
  userId: "viewer" as string | null,
  historicalAt: null as string | null,
  requestId: "request",
  refreshPublic: publicRead,
  refreshHistory: historyRead,
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it("renews an expired image once and uses the refreshed public snapshot", async () => {
  detail.mockResolvedValue({ ...base, image_url: "/renewed" });
  const { result, rerender } = renderHook((props) => useReportImage(props), {
    initialProps: options,
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300_100);
  });
  expect(detail).toHaveBeenCalledWith(base.id, "request");
  expect(result.current.report?.image_url).toBe("/renewed");
  act(() => {
    result.current.refreshImage();
    result.current.refreshImage();
  });
  expect(detail).toHaveBeenCalledTimes(2);
  rerender({ ...options, report: { ...base, image_url: "/new-snapshot" } });
  expect(result.current.report?.image_url).toBe("/new-snapshot");
});
it("refreshes guests from public data and historical images from their original time", async () => {
  const { result, rerender } = renderHook((props) => useReportImage(props), {
    initialProps: { ...options, userId: null },
  });
  await act(async () => result.current.refreshImage());
  expect(publicRead).toHaveBeenCalledTimes(1);
  expect(detail).not.toHaveBeenCalled();
  const at = "2026-11-15T01:00:00Z";
  rerender({ ...options, userId: null, historicalAt: at });
  await act(async () => result.current.refreshImage());
  expect(historyRead).toHaveBeenCalledWith(new Date(at));
});
it("drops a failed image and ignores a previous account's late response", async () => {
  detail.mockRejectedValueOnce(new Error("not available"));
  const { result, rerender } = renderHook((props) => useReportImage(props), {
    initialProps: options,
  });
  await act(async () => result.current.refreshImage());
  expect(result.current.report?.image_url).toBeNull();
  let resolve!: (value: CommunityReport) => void;
  detail.mockReturnValueOnce(
    new Promise<CommunityReport>((done) => {
      resolve = done;
    }),
  );
  rerender({ ...options, report: { ...base, image_url: "/next" } });
  act(() => result.current.refreshImage());
  rerender({ ...options, userId: "another" });
  await act(async () => resolve({ ...base, image_url: "/old-account" }));
  expect(result.current.report?.image_url).toBe(base.image_url);
});

it("renews successive expiring links without looping on an unchanged server URL", async () => {
  detail
    .mockResolvedValueOnce({ ...base, image_url: "/photo?expires=1600" })
    .mockResolvedValue({ ...base, image_url: "/photo?expires=1900" });
  const { result } = renderHook(() => useReportImage(options));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300_100);
  });
  expect(result.current.report?.image_url).toContain("1600");
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300_000);
  });
  expect(result.current.report?.image_url).toContain("1900");
  expect(detail).toHaveBeenCalledTimes(2);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(900_000);
  });
  expect(detail).toHaveBeenCalledTimes(3);
});
