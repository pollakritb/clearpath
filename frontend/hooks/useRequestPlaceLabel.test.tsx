import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useRequestPlaceLabel } from "./useRequestPlaceLabel";
import type {
  LocationLabelResponse,
  LocationSuggestion,
} from "@/frontend/types";
const mocks = vi.hoisted(() => ({ reverse: vi.fn() }));
vi.mock("@/frontend/lib/api-client", () => ({
  api: { reverseLocation: mocks.reverse },
}));
const point = {
  id: "point",
  kind: "point",
  name: "จุดที่เลือกบนแผนที่",
  address: "",
  source: "local",
  lat: 14.020123,
  lon: 99.970456,
} as LocationSuggestion;
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it("resolves a picked point after debouncing and preserves the exact target coordinates", async () => {
  mocks.reverse.mockResolvedValue({
    name: "บริเวณกำแพงแสน",
    address: "นครปฐม",
    source: "photon",
  });
  const { result } = renderHook(() => useRequestPlaceLabel(point, true));
  expect(result.current.loading).toBe(true);
  await act(async () => vi.advanceTimersByTimeAsync(450));
  expect(result.current.point).toMatchObject({
    name: "บริเวณกำแพงแสน",
    address: "นครปฐม",
    lat: point.lat,
    lon: point.lon,
  });
  expect(result.current.loading).toBe(false);
});
it("does not lookup an explicitly searched place or an inactive picker", async () => {
  const { rerender, result } = renderHook(
    ({ active }) => useRequestPlaceLabel(point, active),
    { initialProps: { active: false } },
  );
  await act(async () => vi.advanceTimersByTimeAsync(500));
  expect(mocks.reverse).not.toHaveBeenCalled();
  expect(result.current.point).toBe(point);
  rerender({ active: false });
  const known = { ...point, kind: "amenity", name: "Central Embassy" };
  renderHook(() => useRequestPlaceLabel(known, true));
  await act(async () => vi.advanceTimersByTimeAsync(500));
  expect(mocks.reverse).not.toHaveBeenCalled();
});
it("ignores the previous point's late response and uses a neutral label on failure", async () => {
  let finish!: (value: LocationLabelResponse) => void;
  mocks.reverse
    .mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    )
    .mockRejectedValueOnce(new Error("offline"));
  const { result, rerender } = renderHook(
    ({ point }) => useRequestPlaceLabel(point, true),
    { initialProps: { point } },
  );
  await act(async () => vi.advanceTimersByTimeAsync(450));
  rerender({ point: { ...point, lat: 14.04 } });
  await act(async () =>
    finish({ name: "พื้นที่เก่า", address: "", source: "photon" }),
  );
  expect(result.current.point?.name).not.toBe("พื้นที่เก่า");
  await act(async () => vi.advanceTimersByTimeAsync(450));
  expect(result.current.point?.name).toBe("พื้นที่ที่ขอวัดค่าฝุ่น");
  expect(result.current.point?.lat).toBe(14.04);
  expect(result.current.loading).toBe(false);
});
