import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import StationTimelineControls from "./StationTimelineControls";
vi.mock("@/frontend/lib/api-client", () => ({
  api: { forecastGridMetadata: vi.fn(async () => ({ valid_times: [] })) },
}));
afterEach(cleanup);
const anchor = Date.parse("2030-01-01T00:00:00Z");
const times = [0, 1, 2].map((hour) =>
  new Date(anchor + hour * 3600000).toISOString(),
);
const shared = {
  anchor,
  futureTimes: times,
  station: { id: "85t", name: "สถานีทดสอบ", pm25: 18 },
  loading: false,
  error: null,
  paused: false,
  onClose: vi.fn(),
};
it("opens history at now on the right and moves left through Air4Thai readings", () => {
  const select = vi.fn();
  render(
    <StationTimelineControls
      {...shared}
      mode="history"
      time={{ kind: "current" }}
      onSelect={select}
    />,
  );
  const slider = screen.getByRole("slider", {
    name: "เลือกชั่วโมงย้อนหลัง",
  }) as HTMLInputElement;
  expect(slider.value).toBe("24");
  fireEvent.change(slider, { target: { value: "23" } });
  expect(select).toHaveBeenLastCalledWith({ kind: "history", hours: 1 });
  fireEvent.change(slider, { target: { value: "0" } });
  expect(select).toHaveBeenLastCalledWith({ kind: "history", hours: 24 });
  fireEvent.click(screen.getByRole("button", { name: "ตอนนี้" }));
  expect(select).toHaveBeenLastCalledWith({ kind: "current" });
});
it("opens forecast at now on the left and moves right using only CAMS", () => {
  const select = vi.fn();
  render(
    <StationTimelineControls
      {...shared}
      mode="forecast"
      time={{ kind: "forecast", at: times[0] }}
      onSelect={select}
    />,
  );
  const slider = screen.getByRole("slider", {
    name: "เลือกเวลาพยากรณ์ของสถานี",
  }) as HTMLInputElement;
  expect(slider.value).toBe("0");
  expect(screen.getByText("CAMS · ค่าพยากรณ์")).toBeTruthy();
  fireEvent.change(slider, { target: { value: "1" } });
  expect(select).toHaveBeenLastCalledWith({ kind: "forecast", at: times[1] });
  fireEvent.change(slider, { target: { value: "120" } });
  expect(select).toHaveBeenLastCalledWith({ kind: "forecast", at: times[2] });
  fireEvent.click(screen.getByRole("button", { name: "ตอนนี้" }));
  expect(select).toHaveBeenLastCalledWith({ kind: "forecast", at: times[0] });
  expect(slider.value).toBe("0");
});
