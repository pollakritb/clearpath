import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import MapStationHistory from "./MapStationHistory";
import { clearPublicDataCache } from "@/frontend/lib/public-data-cache";
const mocks = vi.hoisted(() => ({ history: vi.fn() }));
vi.mock("@/frontend/lib/api-client", () => ({
  api: { history: mocks.history },
  apiErrorMessage: (_error: unknown, fallback: string) => fallback,
}));
const points = (values: (number | null)[]) =>
  values.map((pm25, index) => ({
    recorded_at: new Date(Date.UTC(2030, 0, 1, index + 1)).toISOString(),
    pm25,
    aqi: null,
  }));
beforeEach(() => {
  clearPublicDataCache();
  vi.clearAllMocks();
  mocks.history.mockResolvedValue({
    station_id: "25t",
    points: points([12, 20]),
  });
});
afterEach(cleanup);
it("loads station history inline and reuses the cache when reopening the popup", async () => {
  const { unmount } = render(<MapStationHistory stationId="25t" />);
  await screen.findByRole("button", { name: /PM2.5 20$/ });
  expect(mocks.history).toHaveBeenCalledWith("25t", 24);
  unmount();
  render(<MapStationHistory stationId="25t" />);
  await screen.findByRole("button", { name: /PM2.5 20$/ });
  expect(mocks.history).toHaveBeenCalledOnce();
});
it("ignores a late previous-station response after selecting another pin", async () => {
  let resolve!: (value: unknown) => void;
  mocks.history
    .mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    )
    .mockResolvedValueOnce({
      station_id: "111t",
      points: points([30, 40]),
    });
  const { rerender } = render(<MapStationHistory stationId="25t" />);
  rerender(<MapStationHistory stationId="111t" />);
  await screen.findByRole("button", { name: /PM2.5 40$/ });
  await act(async () => resolve({ station_id: "25t", points: points([1]) }));
  expect(screen.getByRole("button", { name: /PM2.5 40$/ })).toBeTruthy();
  expect(screen.queryByRole("button", { name: /PM2.5 1$/ })).toBeNull();
});
it("lets users retry history without leaving the map", async () => {
  mocks.history.mockRejectedValueOnce(new Error("offline"));
  render(<MapStationHistory stationId="25t" />);
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "ลองใหม่" }));
  await screen.findByRole("button", { name: /PM2.5 20$/ });
  expect(mocks.history).toHaveBeenCalledTimes(2);
});

it("shows the latest reading first and selects older hourly cards without a chart", async () => {
  render(<MapStationHistory stationId="25t" />);
  const latest = await screen.findByRole("button", { name: /PM2.5 20$/ });
  expect(latest.getAttribute("aria-pressed")).toBe("true");
  expect(
    document.querySelector(".cp-map-station-forecast__featured")?.textContent,
  ).toContain("20");
  const older = screen.getByRole("button", { name: /PM2.5 12$/ });
  fireEvent.click(older);
  expect(older.getAttribute("aria-pressed")).toBe("true");
  expect(latest.getAttribute("aria-pressed")).toBe("false");
  expect(
    document.querySelector(".cp-map-station-forecast__featured")?.textContent,
  ).toContain("12");
  expect(screen.queryByRole("img")).toBeNull();
});
it("keeps missing readings distinct from zero and handles an empty history", async () => {
  mocks.history.mockResolvedValueOnce({
    station_id: "25t",
    points: points([0, null]),
  });
  const { unmount } = render(<MapStationHistory stationId="25t" />);
  await screen.findByRole("button", { name: /PM2.5 ไม่มีข้อมูล$/ });
  expect(screen.getByRole("button", { name: /PM2.5 0$/ })).toBeTruthy();
  expect(screen.getByText("ไม่มีข้อมูลช่วงเวลานี้")).toBeTruthy();
  unmount();
  mocks.history.mockResolvedValueOnce({ station_id: "empty", points: [] });
  render(<MapStationHistory stationId="empty" />);
  await screen.findByText("ยังไม่มีค่าตรวจวัดย้อนหลังใน 24 ชั่วโมงนี้");
});
