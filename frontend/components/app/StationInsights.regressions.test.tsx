import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "@/frontend/lib/api-client";
import type { Station } from "@/frontend/types";
import StationInsights from "./StationInsights";
vi.mock("@/frontend/lib/api-client", () => ({ api: { history: vi.fn() } }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  vi.useRealTimers();
});
const station = {
  id: "A",
  pm25: 10,
  recorded_at: "2026-11-12T00:00:00Z",
} as Station;
it("anchors the request when expanded rather than when the collapsed sheet mounted", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-12T01:00:00Z"));
  vi.mocked(api.history).mockResolvedValue({
    station_id: "A",
    points: [{ recorded_at: "2026-11-12T02:00:00Z", pm25: 20, aqi: null }],
  });
  const { rerender, container } = render(
    <StationInsights station={station} enabled={false} />,
  );
  expect(api.history).not.toHaveBeenCalled();
  vi.setSystemTime(new Date("2026-11-12T02:05:00Z"));
  await act(async () =>
    rerender(<StationInsights station={station} enabled />),
  );
  expect(api.history).toHaveBeenCalledWith(
    "A",
    24,
    "2026-11-12T02:05:00.000Z",
    expect.any(AbortSignal),
  );
  expect(container.textContent).toContain("20.0");
  expect(container.textContent).not.toContain(
    "ยังไม่มีข้อมูลย้อนหลังในช่วงนี้",
  );
});
it("requests the selected historical window and cancels obsolete work", async () => {
  vi.mocked(api.history).mockResolvedValue({ station_id: "A", points: [] });
  const { rerender } = render(
    <StationInsights
      station={station}
      enabled
      historicalAt="2026-11-11T12:00:00Z"
    />,
  );
  await act(async () => {});
  expect(api.history).toHaveBeenCalledWith(
    "A",
    24,
    "2026-11-11T12:00:00.000Z",
    expect.any(AbortSignal),
  );
  await act(async () =>
    rerender(
      <StationInsights
        station={station}
        enabled
        historicalAt="2026-11-11T13:00:00Z"
      />,
    ),
  );
  expect(vi.mocked(api.history).mock.calls[0][3]?.aborted).toBe(true);
});
