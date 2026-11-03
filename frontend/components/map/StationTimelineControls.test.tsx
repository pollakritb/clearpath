import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import StationTimelineControls from "./StationTimelineControls";

vi.mock("@/frontend/lib/api-client", () => ({
  api: { forecastGridMetadata: vi.fn(async () => ({ valid_times: [] })) },
}));
afterEach(cleanup);
const anchor = Date.parse("2030-01-01T00:00:00Z");
const times = ["2030-01-01T01:00:00Z", "2030-01-01T02:00:00Z"];
it("opens centered and selects measured history, current readings and forecast using one slider", async () => {
  const select = vi.fn();
  render(
    <StationTimelineControls
      time={{ kind: "current" }}
      anchor={anchor}
      futureTimes={times}
      station={{ id: "85t", name: "สถานีทดสอบ", pm25: 18 }}
      loading={false}
      error={null}
      paused={false}
      onSelect={select}
      onClose={vi.fn()}
    />,
  );
  const slider = screen.getByRole("slider", {
    name: "เลือกเวลาตรวจวัดและพยากรณ์",
  });
  expect(slider.getAttribute("aria-valuetext")).toBe("ตอนนี้ · Air4Thai");
  expect((slider as HTMLInputElement).value).toBe("24");
  fireEvent.change(slider, { target: { value: "0" } });
  expect(select).toHaveBeenLastCalledWith({ kind: "history", hours: 24 });
  fireEvent.click(screen.getByRole("button", { name: "ตอนนี้" }));
  expect(select).toHaveBeenLastCalledWith({ kind: "current" });
  fireEvent.change(slider, { target: { value: "48" } });
  expect(select).toHaveBeenLastCalledWith({ kind: "forecast", at: times[1] });
  await waitFor(() => expect(screen.getByText("สถานีทดสอบ")).toBeTruthy());
});
