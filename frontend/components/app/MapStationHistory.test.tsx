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
vi.mock("@/frontend/components/panels/HistoryChart", () => ({
  default: ({
    points,
    loading,
  }: {
    points: { pm25: number }[];
    loading: boolean;
  }) => (
    <div role="img" aria-label="กราฟสถานี">
      {loading ? "loading" : points.map((p) => p.pm25).join(",")}
    </div>
  ),
}));
beforeEach(() => {
  clearPublicDataCache();
  vi.clearAllMocks();
  mocks.history.mockResolvedValue({
    station_id: "25t",
    points: [{ pm25: 12 }, { pm25: 20 }],
  });
});
afterEach(cleanup);
it("loads station history inline and reuses the cache when reopening the popup", async () => {
  const { unmount } = render(<MapStationHistory stationId="25t" />);
  await screen.findByText("12,20");
  expect(mocks.history).toHaveBeenCalledWith("25t", 24);
  unmount();
  render(<MapStationHistory stationId="25t" />);
  await screen.findByText("12,20");
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
      points: [{ pm25: 30 }, { pm25: 40 }],
    });
  const { rerender } = render(<MapStationHistory stationId="25t" />);
  rerender(<MapStationHistory stationId="111t" />);
  await screen.findByText("30,40");
  await act(async () => resolve({ station_id: "25t", points: [{ pm25: 1 }] }));
  expect(screen.getByText("30,40")).toBeTruthy();
});
it("lets users retry history without leaving the map", async () => {
  mocks.history.mockRejectedValueOnce(new Error("offline"));
  render(<MapStationHistory stationId="25t" />);
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "ลองใหม่" }));
  await screen.findByText("12,20");
  expect(mocks.history).toHaveBeenCalledTimes(2);
});
