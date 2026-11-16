import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import OwnedReportPage from "./OwnedReportPage";
const state = vi.hoisted(() => ({
  owner: "owner" as string | null,
  refresh: vi.fn(),
  login: vi.fn(),
  report: null as Record<string, unknown> | null,
}));
vi.mock("@/frontend/components/auth/AuthProvider", () => ({
  useAuth: () => ({
    user: state.owner ? { id: state.owner } : null,
    localDemo: false,
    loading: false,
  }),
}));
vi.mock("@/frontend/components/auth/LoginPromptProvider", () => ({
  useLoginPrompt: () => ({ openLoginPrompt: state.login }),
}));
vi.mock("@/frontend/components/app/UserPageShell", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
}));
vi.mock("@/frontend/hooks/useAccountData", () => ({
  useAccountData: () => ({
    data: state.report,
    error: null,
    refresh: state.refresh,
  }),
}));
afterEach(cleanup);
beforeEach(() => {
  state.owner = "owner";
  state.refresh.mockClear();
  state.login.mockClear();
  state.report = {
    id: "RPT-000004",
    status: "approved",
    verified_pm25: 17,
    captured_at: "2020-01-01T00:00:00Z",
    created_at: "2020-01-01T00:01:00Z",
    is_fresh: false,
    image_url: null,
  };
});
it("opens archived report metadata without a current-map link, and returns to own reports", () => {
  render(<OwnedReportPage reportId="RPT-000004" />);
  expect(
    screen.getByText("รายงานย้อนหลัง ไม่อยู่ในชั้นข้อมูลล่าสุดบนแผนที่"),
  ).toBeTruthy();
  expect(
    screen
      .getByRole("link", { name: "← กลับรายงานของฉัน" })
      .getAttribute("href"),
  ).toBe("/profile?tab=reports");
  expect(screen.queryByRole("link", { name: "ดูบนแผนที่" })).toBeNull();
  expect(
    screen.getByText("ไม่มีภาพให้เปิดดู หรือภาพพ้นระยะจัดเก็บแล้ว"),
  ).toBeTruthy();
});
it("shows a rejected report with a route to retake its photograph", () => {
  state.report!.status = "rejected";
  state.report!.rejection_reason_code = "duplicate";
  render(<OwnedReportPage reportId="RPT-000004" />);
  expect(screen.getByText("รายงานไม่ผ่าน: หลักฐานซ้ำ")).toBeTruthy();
  expect(
    screen
      .getByRole("link", { name: "ถ่ายภาพใหม่และส่งอีกครั้ง" })
      .getAttribute("href"),
  ).toBe("/report");
});
it("requires login before rendering report metadata", () => {
  state.owner = null;
  render(<OwnedReportPage reportId="RPT-000004" />);
  expect(screen.queryByText("รายงาน RPT-000004")).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "เข้าสู่ระบบเพื่อดูรายงาน" }),
  );
  expect(state.login).toHaveBeenCalledOnce();
});
