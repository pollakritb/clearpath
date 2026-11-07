import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import PlaceHistoryPanel from "./PlaceHistoryPanel";
import type { PlaceAir } from "@/frontend/lib/place-air";
const mocks = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("@/frontend/lib/api-client", () => ({
  api: { mapHistory: mocks.load },
  apiErrorMessage: (_error: unknown, fallback: string) => fallback,
}));
const place = {
  id: "park",
  name: "สวนทดสอบ",
  address: "นครปฐม",
  lat: 13.82,
  lon: 100.06,
  kind: "park",
  source: "local" as const,
};
const current: PlaceAir = {
  value: 50,
  method: "idw",
  contributors: [],
  stations: [],
  reports: [],
  nearestStation: null,
};
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-07T03:00:00Z"));
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it("recalculates the selected place using historical timestamps rather than treating historic readings as stale today", async () => {
  mocks.load.mockResolvedValue({
    target_at: "2026-11-07T02:00:00Z",
    reports: [],
    stations: [
      {
        id: "s1",
        lat: 13.82,
        lon: 100.06,
        pm25: 12,
        recorded_at: "2026-11-07T01:58:00Z",
        in_service_area: true,
        data_status: "fresh",
        eligible_for_surface: true,
      },
    ],
  });
  render(
    <PlaceHistoryPanel
      place={place}
      current={current}
      onBack={vi.fn()}
      onClose={vi.fn()}
    />,
  );
  expect(screen.getByText("50")).toBeTruthy();
  fireEvent.change(screen.getByRole("slider"), { target: { value: "23" } });
  await waitFor(() => expect(screen.getByText("12")).toBeTruthy());
  expect(mocks.load).toHaveBeenCalledWith("2026-11-07T02:00:00.000Z");
  fireEvent.click(screen.getByRole("button", { name: "ตอนนี้" }));
  expect(screen.getByText("50")).toBeTruthy();
});
it("does not substitute a current estimate when history fails", async () => {
  mocks.load.mockRejectedValue(new Error("offline"));
  render(
    <PlaceHistoryPanel
      place={place}
      current={current}
      onBack={vi.fn()}
      onClose={vi.fn()}
    />,
  );
  fireEvent.change(screen.getByRole("slider"), { target: { value: "22" } });
  await screen.findByRole("alert");
  expect(screen.queryByText("50")).toBeNull();
  expect(screen.getByText("โหลดข้อมูลไม่สำเร็จ")).toBeTruthy();
});
