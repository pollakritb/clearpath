import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import LineNotificationCard from "./LineNotificationCard";
const api = vi.hoisted(() => ({
  lineNotificationStatus: vi.fn(),
  createLineLinkCode: vi.fn(),
  disconnectLine: vi.fn(),
  testLineNotification: vi.fn(),
}));
vi.mock("@/frontend/lib/api-client", () => ({
  api,
  apiErrorMessage: (_e: unknown, fallback: string) => fallback,
}));
vi.mock("@/frontend/components/auth/AlertLocationPresence", () => ({
  ALERT_PREFERENCES_CHANGED: "cp-test-prefs",
}));
const status = (linked: boolean) => ({
  enabled: true,
  linked,
  linked_at: linked ? "2026-11-27T00:00:00Z" : null,
  official_account_url: "https://line.me/example",
});
beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  api.lineNotificationStatus.mockResolvedValue(status(false));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it("refreshes on return from LINE and ignores an older disconnected result", async () => {
  let finish!: (data: unknown) => void;
  api.lineNotificationStatus.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(<LineNotificationCard />);
  api.lineNotificationStatus.mockResolvedValueOnce(status(true));
  await act(async () => {
    window.dispatchEvent(new Event("focus"));
  });
  expect(screen.getByText("เชื่อมแล้ว")).toBeTruthy();
  await act(async () => {
    finish(status(false));
  });
  expect(screen.getByText("เชื่อมแล้ว")).toBeTruthy();
  expect(screen.queryByText("ยังไม่เชื่อม")).toBeNull();
});
it("keeps the last known link on a transient status error", async () => {
  api.lineNotificationStatus.mockResolvedValueOnce(status(true));
  render(<LineNotificationCard />);
  await act(async () => {});
  api.lineNotificationStatus.mockRejectedValueOnce(new Error("offline"));
  await act(async () => {
    window.dispatchEvent(new Event("focus"));
  });
  expect(screen.getByText("เชื่อมแล้ว")).toBeTruthy();
  expect(screen.getByRole("alert")).toBeTruthy();
});
it("cancels a pending code and ignores a late linked response after reset", async () => {
  render(<LineNotificationCard />);
  await act(async () => {});
  api.createLineLinkCode.mockResolvedValue({
    code: "CP-ABCDEFGH",
    expires_at: new Date(Date.now() + 600000).toISOString(),
  });
  await act(async () => {
    fireEvent.click(screen.getByText("สร้างรหัสเชื่อมบัญชี"));
  });
  let finish!: (data: unknown) => void;
  api.lineNotificationStatus.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await act(async () => {
    window.dispatchEvent(new Event("focus"));
  });
  api.disconnectLine.mockResolvedValue({ ok: true, message: "ล้างข้อมูลแล้ว" });
  await act(async () => {
    fireEvent.click(screen.getByText("ยกเลิกรหัสและล้างข้อมูล LINE"));
  });
  await act(async () => {
    finish(status(true));
  });
  expect(screen.getByText("ยังไม่เชื่อม")).toBeTruthy();
  expect(screen.queryByText("CP-ABCDEFGH")).toBeNull();
  expect(api.disconnectLine).toHaveBeenCalledOnce();
});
it("offers reset even when linking is disabled or status says unlinked", async () => {
  api.lineNotificationStatus.mockResolvedValue({
    ...status(false),
    enabled: false,
  });
  render(<LineNotificationCard />);
  await act(async () => {});
  expect(screen.getByText("ยกเลิกและลบการเชื่อมต่อ LINE")).toBeTruthy();
  expect(api.testLineNotification).not.toHaveBeenCalled();
});
