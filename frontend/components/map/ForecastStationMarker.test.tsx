import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { DivIcon } from "leaflet";
import ForecastStationMarker from "./ForecastStationMarker";
import type { ForecastStationPoint } from "@/frontend/types/ui";
vi.mock("react-leaflet", () => ({
  useMap: () => ({ getContainer: () => document.createElement("div") }),
  Marker: ({ icon, title }: { icon: DivIcon; title: string }) => (
    <div
      title={title}
      dangerouslySetInnerHTML={{ __html: String(icon.options.html) }}
    />
  ),
}));
afterEach(cleanup);
const point: ForecastStationPoint = {
  id: "station",
  name: "สถานีทดสอบ",
  lat: 13.7,
  lon: 100.5,
  pm25: 7.6,
  validAt: "2026-11-12T10:00:00Z",
  loading: false,
  error: null,
};
it("labels the forecast value distinctly without a historical clock", () => {
  const { container } = render(<ForecastStationMarker point={point} />);
  expect(screen.getByRole("img").textContent).toContain("7.6");
  expect(screen.getByText("พยากรณ์")).toBeTruthy();
  expect(container.querySelector(".cp-marker-previous")).toBeNull();
  expect(screen.getByTitle(/CAMS ไม่ใช่ค่าตรวจวัดจริง/)).toBeTruthy();
});
it("retains the station marker during loading or failures without showing stale values", () => {
  const { rerender } = render(
    <ForecastStationMarker point={{ ...point, loading: true }} />,
  );
  expect(screen.getByRole("img").getAttribute("aria-label")).toBe(
    "กำลังโหลดพยากรณ์",
  );
  expect(screen.queryByText("7.6")).toBeNull();
  rerender(<ForecastStationMarker point={{ ...point, error: "offline" }} />);
  expect(screen.getByRole("img").getAttribute("aria-label")).toBe(
    "ไม่มีข้อมูลพยากรณ์",
  );
  expect(screen.getByText("—")).toBeTruthy();
});
it("keeps zero distinct from missing or invalid forecast data", () => {
  const { rerender } = render(
    <ForecastStationMarker point={{ ...point, pm25: 0 }} />,
  );
  expect(screen.getByText("0.0")).toBeTruthy();
  rerender(<ForecastStationMarker point={{ ...point, pm25: NaN }} />);
  expect(screen.getByText("—")).toBeTruthy();
});
