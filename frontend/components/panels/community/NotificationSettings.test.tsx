import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import NotificationSettings from "./NotificationSettings";
const mocks = vi.hoisted(() => ({ load: vi.fn() }));
const user = { id: "test-user" };
vi.mock("@/frontend/components/auth/AuthProvider", () => ({
  useAuth: () => ({ user, localDemo: false }),
}));
vi.mock("@/frontend/components/auth/LoginPromptProvider", () => ({
  useLoginPrompt: () => ({ openLoginPrompt: vi.fn() }),
}));
vi.mock("@/frontend/lib/api-client", () => ({
  api: { notificationPreferences: mocks.load },
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
  expect(screen.getByText(/มีคำขอให้ช่วยวัด: ตามพื้นที่ผู้ช่วย/)).toBeTruthy();
  expect(
    screen.getByText(/คำขอได้รับข้อมูลแล้ว: เมื่อคำขอของคุณ/),
  ).toBeTruthy();
  expect(
    screen.getByRole("checkbox", { name: /PM2.5 ถึงหรือเกินค่าที่ตั้งไว้/ }),
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
