import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import NotificationSettings from "./NotificationSettings";
const mocks = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn() }));
const user = { id: "test-user" };
vi.mock("@/frontend/components/auth/AuthProvider", () => ({
  useAuth: () => ({ user, localDemo: false }),
}));
vi.mock("@/frontend/components/auth/LoginPromptProvider", () => ({
  useLoginPrompt: () => ({ openLoginPrompt: vi.fn() }),
}));
vi.mock("@/frontend/lib/api-client", () => ({
  api: {
    notificationPreferences: mocks.load,
    updateNotificationPreferences: mocks.save,
    alertLocation: vi
      .fn()
      .mockResolvedValue({ status: "missing", observed_at: null }),
  },
  apiErrorMessage: () => "error",
}));
vi.mock("./LineNotificationCard", () => ({ default: () => null }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("shows the three LINE event categories and omits retired event controls", async () => {
  mocks.load.mockResolvedValue({
    air_alerts: true,
    pm25_threshold: 37.5,
    center_lat: 13.7,
    center_lon: 100.5,
    radius_km: 2,
    quiet_hours_start: "22:00",
    quiet_hours_end: "07:00",
    line_enabled: true,
    consent_granted: true,
    hotspot_alerts: true,
    report_status_alerts: true,
    rating_alerts: true,
    reward_alerts: true,
    announcement_alerts: true,
  });
  render(<NotificationSettings />);
  fireEvent.click(await screen.findByRole("button", { name: "แก้ไขเงื่อนไข" }));
  expect(screen.queryAllByRole("slider")).toHaveLength(0);
  expect(document.querySelector('input[type="time"]')).toBeNull();
  expect(screen.queryByText("ช่วงไม่รบกวน")).toBeNull();
  expect(
    (screen.getByRole("checkbox", { name: /37.6–75.0/ }) as HTMLInputElement)
      .checked,
  ).toBe(true);
  expect(
    (screen.getByRole("checkbox", { name: /75.1 µg/ }) as HTMLInputElement)
      .checked,
  ).toBe(true);
  expect(screen.getByText(/มีคำขอให้ช่วยวัด: ตามพื้นที่ผู้ช่วย/)).toBeTruthy();
  expect(
    screen.getByText(/คำขอได้รับข้อมูลแล้ว: เมื่อคำขอของคุณ/),
  ).toBeTruthy();
  expect(
    screen.getByRole("checkbox", { name: /เปิดแจ้งเตือนค่าฝุ่น/ }),
  ).toBeTruthy();
  for (const label of [
    /จุดความร้อน/,
    /สถานะรายงานของฉัน/,
    /เสียงประเมิน/,
    /คะแนนและเหรียญ/,
    /อันดับประจำเดือน/,
    /ประกาศสำคัญ/,
  ])
    expect(screen.queryByText(label)).toBeNull();
});

it("saves level toggles without requiring the retired consent checkbox", async () => {
  mocks.load.mockResolvedValue({
    air_alerts: true,
    line_enabled: true,
    consent_granted: false,
    pm25_threshold: 100,
    radius_km: 50,
    quiet_hours_start: "22:00",
    quiet_hours_end: "07:00",
  });
  mocks.save.mockImplementation(async (value) => value);
  render(<NotificationSettings />);
  fireEvent.click(await screen.findByRole("button", { name: "แก้ไขเงื่อนไข" }));
  expect(screen.queryByRole("checkbox", { name: /ยินยอม/ })).toBeNull();
  expect(screen.queryByText(/ลบ token/)).toBeNull();
  fireEvent.click(screen.getByRole("checkbox", { name: /37.6–75.0/ }));
  fireEvent.click(screen.getByRole("button", { name: "บันทึกเงื่อนไข" }));
  await waitFor(() =>
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        radius_km: 2,
        pm25_threshold: 37.6,
        quiet_hours_start: null,
        quiet_hours_end: null,
        air_alert_warning: false,
        air_alert_danger: true,
        consent_granted: true,
      }),
    ),
  );
});
