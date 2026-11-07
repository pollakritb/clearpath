import { cleanup, renderHook, waitFor, act } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { usePlaceAir } from "./usePlaceAir";
import type { CommunityReport } from "@/frontend/types";
const mocks = vi.hoisted(() => ({ select: vi.fn() }));
vi.mock("@/frontend/lib/api-client", () => ({
  api: { placeReportSelection: mocks.select },
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
const at = Date.parse("2026-11-07T05:00:00Z");
const place = { lat: 13.8, lon: 100.1 };
const reports = [
  {
    id: "a",
    user_id: "token-a",
    lat: 13.8,
    lon: 100.101,
    pm25: 80,
    status: "approved",
    captured_at: new Date(at).toISOString(),
  },
  {
    id: "b",
    user_id: "token-b",
    lat: 13.8,
    lon: 100.102,
    pm25: 34,
    status: "approved",
    captured_at: new Date(at).toISOString(),
  },
] as CommunityReport[];
it("waits for private author selection and only computes the chosen report", async () => {
  mocks.select.mockResolvedValue({ report_ids: ["b"] });
  const { result } = renderHook(() => usePlaceAir(place, [], reports, at));
  expect(result.current?.value).toBeNull();
  await waitFor(() => expect(result.current?.value).toBe(34));
  expect(result.current?.selectionPending).toBe(false);
});
it("does not include anonymous reports when selection fails", async () => {
  mocks.select.mockRejectedValue(new Error("offline"));
  const { result } = renderHook(() => usePlaceAir(place, [], reports, at));
  await waitFor(() => expect(result.current?.selectionError).toBe(true));
  expect(result.current?.value).toBeNull();
  expect(result.current?.reports[0].exclusion).toBe("selection_unavailable");
});
it("ignores a late response for a previously selected place", async () => {
  let finish!: (value: { report_ids: string[] }) => void;
  mocks.select
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValue({ report_ids: ["b"] });
  const { result, rerender } = renderHook(
    ({ lon }) => usePlaceAir({ lat: 13.8, lon }, [], reports, at),
    { initialProps: { lon: 100.1 } },
  );
  rerender({ lon: 100.101 });
  await waitFor(() => expect(result.current?.value).toBe(34));
  await act(async () => finish({ report_ids: ["a"] }));
  expect(result.current?.value).toBe(34);
});
