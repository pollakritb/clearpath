import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import CamsForecastControls from "./CamsForecastControls";
import type { useForecastGrid } from "@/frontend/hooks/useForecastGrid";
afterEach(cleanup);
const at = "2030-01-01T00:00:00Z";
const grid = {
  at,
  requestedAt: at,
  times: [at],
  meta: null,
  loading: false,
  error: null,
  surface: {
    latitudes: [13, 14],
    longitudes: [100, 101],
    values: [20, 20, 20, 20],
    validAt: at,
    generationId: "g",
  },
  select: vi.fn(),
  now: vi.fn(),
  togglePlay: vi.fn(),
  pause: vi.fn(),
  retry: vi.fn(),
  preparedFrames: 1,
} as unknown as ReturnType<typeof useForecastGrid>;
it("distinguishes outside Thailand from missing grid data and keeps the foreign point free of a request action", () => {
  render(
    <CamsForecastControls
      grid={grid}
      point={{ lat: 17.9757, lon: 102.6331 }}
      onClosePoint={vi.fn()}
      onRequest={vi.fn()}
      onExit={vi.fn()}
    />,
  );
  expect(screen.getByText("นอกพื้นที่พยากรณ์ประเทศไทย")).toBeTruthy();
  expect(screen.queryByText("ไม่มีข้อมูล")).toBeNull();
  expect(screen.queryByText("ขอให้ชุมชนช่วยวัดบริเวณนี้ →")).toBeNull();
});
it("still shows forecast values and the community action for a point in Thailand", () => {
  render(
    <CamsForecastControls
      grid={grid}
      point={{ lat: 13.75, lon: 100.5 }}
      onClosePoint={vi.fn()}
      onRequest={vi.fn()}
      onExit={vi.fn()}
    />,
  );
  expect(screen.getByText("20.0")).toBeTruthy();
  expect(screen.getByText("ขอให้ชุมชนช่วยวัดบริเวณนี้ →")).toBeTruthy();
});
