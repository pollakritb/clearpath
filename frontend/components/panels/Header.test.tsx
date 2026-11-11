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
it("does not advertise stale stations as available", () => {
  render(<Header {...props} />);
  expect(
    screen.getByText("ยังไม่มีข้อมูลสถานีที่เข้าเกณฑ์ปัจจุบัน"),
  ).toBeTruthy();
  expect(screen.queryByText(/พร้อมใช้งาน/)).toBeNull();
});
it("separates the fresh count from the total", () => {
  render(<Header {...props} delayedCount={0} expiredCount={22} />);
  expect(screen.getByText("ข้อมูลเข้าเกณฑ์ 156 จาก 178 สถานี")).toBeTruthy();
});
it("does not count a recent timestamp with a missing PM value as usable", () => {
  render(
    <Header {...props} delayedCount={0} expiredCount={0} currentCount={0} />,
  );
  expect(
    screen.getByText("ยังไม่มีข้อมูลสถานีที่เข้าเกณฑ์ปัจจุบัน"),
  ).toBeTruthy();
  expect(
    screen.getByText("สถานีทั้งหมด 178 · ข้อมูลไม่เข้าเกณฑ์ 178"),
  ).toBeTruthy();
});
