import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import MapStationForecast from "./MapStationForecast";
import type { ForecastResponse } from "@/frontend/types";
const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  data: null as ForecastResponse | null,
  error: null as string | null,
}));
vi.mock("@/frontend/hooks/useForecast", () => ({
  useForecast: () => ({
    data: mocks.data,
    loading: false,
    error: mocks.error,
    load: mocks.load,
  }),
}));
function forecast(count = 92): ForecastResponse {
  return {
    station_id: "25t",
    target_kind: "station",
    fetched_at: "2026-11-01T22:09:00Z",
    points: Array.from({ length: count }, (_, index) => ({
      pm25: 10 + index,
      source: "openmeteo_cams",
      forecast_at: new Date(
        Date.parse("2026-11-02T04:00:00Z") + index * 3600000,
      ).toISOString(),
      valid_at: null,
    })),
    forecast_status: "limited",
    horizon_hours: 120,
  } as ForecastResponse;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.error = null;
  mocks.data = forecast();
});
afterEach(cleanup);
it.each([92, 120])(
  "requests five days and exposes all %s actual hours without a show-more gate",
  (count) => {
    mocks.data = forecast(count);
    render(<MapStationForecast stationId="25t" />);
    expect(mocks.load).toHaveBeenCalledWith("25t", 120);
    const timeline = screen.getByRole("group", { name: "เลือกชั่วโมงพยากรณ์" });
    expect(within(timeline).getAllByRole("button")).toHaveLength(count);
    expect(screen.getByText(new RegExp(`${count} ช่วงเวลา`))).toBeTruthy();
    expect(screen.queryByRole("button", { name: /ดูครบ|แสดง 6/ })).toBeNull();
  },
);
it("jumps to a selected Bangkok day and keeps the featured value aligned with the chosen hour", () => {
  render(<MapStationForecast stationId="25t" />);
  fireEvent.change(screen.getByLabelText("เลือกวันพยากรณ์"), {
    target: { value: "2026-11-06" },
  });
  const selected = screen.getByRole("button", { pressed: true });
  expect(selected.getAttribute("data-day")).toBe("2026-11-06");
  expect(selected.textContent).toContain("00:00");
  const buttons = within(
    screen.getByRole("group", { name: "เลือกชั่วโมงพยากรณ์" }),
  ).getAllByRole("button");
  fireEvent.click(buttons[91]);
  expect(buttons[91].getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByLabelText("เลือกวันพยากรณ์")).toHaveProperty(
    "value",
    "2026-11-06",
  );
  expect(
    document.querySelector(".cp-map-station-forecast__featured strong")
      ?.textContent,
  ).toContain("101");
});
it("loads an area forecast inside the popup and never links to Today", () => {
  mocks.data = {
    ...forecast(),
    station_id: null,
    target_kind: "area",
    requested_lat: 14.02,
    requested_lon: 100,
  };
  const { container } = render(
    <MapStationForecast area={{ lat: 14.024, lon: 100.002 }} />,
  );
  expect(mocks.load).toHaveBeenCalledWith({ lat: 14.024, lon: 100.002 }, 120);
  expect(
    screen.getByText("บริเวณที่เลือก · ไม่ใช่ค่าตรวจวัดจริง"),
  ).toBeTruthy();
  expect(container.querySelector('a[href^="/air"]')).toBeNull();
  expect(
    screen.getByRole("group", { name: "เลือกชั่วโมงพยากรณ์" }),
  ).toBeTruthy();
});
it("does not show the previous station's forecast while another pin loads", () => {
  const { rerender } = render(<MapStationForecast stationId="25t" />);
  rerender(<MapStationForecast stationId="111t" />);
  expect(
    screen.queryByRole("group", { name: "เลือกชั่วโมงพยากรณ์" }),
  ).toBeNull();
  expect(screen.getByText("กำลังโหลดพยากรณ์…")).toBeTruthy();
});
