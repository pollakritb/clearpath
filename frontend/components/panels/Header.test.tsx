import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import Header from "./Header";
vi.mock("@/frontend/components/auth/AccountMenu", () => ({
  default: () => null,
}));
afterEach(cleanup);
const props = {
  icon: "activity" as const,
  theme: "overview" as const,
  title: "อากาศวันนี้",
  description: "ค่าปัจจุบัน",
  stationCount: 178,
  updatedAt: null,
  loading: false,
  delayedCount: 147,
  expiredCount: 31,
  error: null,
};
it("does not advertise stale stations as ready when no observations are fresh", () => {
  render(<Header {...props} />);
  expect(screen.getByText("ยังไม่มีข้อมูลสถานีสด")).toBeTruthy();
  expect(screen.queryByText(/พร้อมใช้งาน/)).toBeNull();
  expect(screen.getByText(/ระบบตรวจข้อมูลรอบใหม่อัตโนมัติ/)).toBeTruthy();
});
it("separates fresh station counts from the total", () => {
  render(<Header {...props} delayedCount={0} expiredCount={22} />);
  expect(screen.getByText("ข้อมูลสด 156 จาก 178 สถานี")).toBeTruthy();
});
