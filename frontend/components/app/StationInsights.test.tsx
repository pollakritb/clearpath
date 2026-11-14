import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Station } from "@/frontend/types";
import StationInsights from "./StationInsights";
const mocks = vi.hoisted(() => ({ history: vi.fn() }));
vi.mock("@/frontend/lib/api-client", () => ({
  api: { history: mocks.history },
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
const station = {
  id: "test",
  pm25: 40,
  recorded_at: "2026-11-11T10:00:00Z",
  age_minutes: 73,
  data_status: "delayed",
  eligible_for_surface: true,
} as Station;
it("defers history until expansion and keeps missing hours visible", async () => {
  mocks.history.mockResolvedValue({
    points: [
      { recorded_at: "2026-11-11T10:00:00Z", pm25: 40 },
      { recorded_at: "2026-11-11T08:00:00Z", pm25: 20 },
    ],
  });
  const { rerender } = render(
    <StationInsights
      station={station}
      enabled={false}
      historicalAt="2026-11-11T10:30:00Z"
    />,
  );
  expect(mocks.history).not.toHaveBeenCalled();
  rerender(
    <StationInsights
      station={station}
      enabled
      historicalAt="2026-11-11T10:30:00Z"
    />,
  );
  expect(await screen.findByText(/มีข้อมูล 2\/24/)).toBeTruthy();
  expect(screen.getByText("ข้อมูลไม่พอเปรียบเทียบกับชั่วโมงก่อน")).toBeTruthy();
  expect(screen.queryByText("คำแนะนำตามค่าที่บันทึก")).toBeNull();
  expect(screen.queryByText("ดูเกณฑ์ทั้ง 5 ระดับ")).toBeNull();
  expect(screen.getByText(/รหัสสถานี test/)).toBeTruthy();
  fireEvent.change(screen.getByRole("slider"), { target: { value: "22" } });
  expect(screen.getByRole("slider").getAttribute("aria-valuetext")).toContain(
    "ไม่มีข้อมูล",
  );
  expect(screen.getByText("ไม่มีข้อมูล", { exact: true })).toBeTruthy();
});
it("offers retry on failure instead of substituting zero", async () => {
  mocks.history
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValue({ points: [] });
  render(<StationInsights station={station} enabled />);
  fireEvent.click(await screen.findByRole("button", { name: "ลองใหม่" }));
  await waitFor(() => expect(mocks.history).toHaveBeenCalledTimes(2));
  expect(
    await screen.findByText("ยังไม่มีข้อมูลย้อนหลังในช่วงนี้"),
  ).toBeTruthy();
});

it("starts the mobile hour selector at the latest available reading", async () => {
  mocks.history.mockResolvedValue({
    points: [{ recorded_at: "2026-11-11T08:00:00Z", pm25: 20 }],
  });
  render(
    <StationInsights
      station={station}
      enabled
      historicalAt="2026-11-11T10:30:00Z"
    />,
  );
  expect(await screen.findByText(/มีข้อมูล 1\/24/)).toBeTruthy();
  expect((screen.getByRole("slider") as HTMLInputElement).value).toBe("21");
  expect(screen.queryByText("ไม่มีข้อมูล", { exact: true })).toBeNull();
});
