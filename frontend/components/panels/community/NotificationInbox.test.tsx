import { useState } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import NotificationInbox from "./NotificationInbox";

const mocks = vi.hoisted(() => ({ markAll: vi.fn() }));
vi.mock("@/frontend/components/auth/AuthProvider", () => ({
  useCurrentUserId: () => "user",
}));
vi.mock("@/frontend/lib/api-client", () => ({
  api: { notifications: vi.fn(), markAllNotificationsRead: mocks.markAll },
}));
vi.mock("@/frontend/hooks/useAccountData", () => ({
  useAccountData: () => {
    const [data, setData] = useState({
      unread_count: 15,
      notifications: Array.from({ length: 15 }, (_, i) => ({
        id: String(i),
        title: `แจ้งเตือน ${i + 1}`,
        body: "ข้อมูลทดสอบ",
        url: "/",
        read_at: null,
        created_at: "2026-11-01T00:00:00Z",
      })),
    });
    return { data, setData, loading: false, error: null };
  },
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("makes the older retrieved notifications reachable and announces the visible count", () => {
  render(<NotificationInbox />);
  expect(screen.queryByText("แจ้งเตือน 11")).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "ดูการแจ้งเตือนเพิ่มเติม (5)" }),
  );
  expect(screen.getByText("แจ้งเตือน 15")).toBeTruthy();
  expect(document.activeElement).toBe(
    screen.getByText("แจ้งเตือน 11").closest("a"),
  );
  expect(screen.getByRole("status").textContent).toContain("15 จาก 15");
  expect(
    screen.queryByRole("button", { name: /ดูการแจ้งเตือนเพิ่มเติม/ }),
  ).toBeNull();
});
it("disables mark-all while pending and preserves unread state on failure", async () => {
  let reject!: (error: Error) => void;
  mocks.markAll.mockImplementation(
    () =>
      new Promise((_, failure) => {
        reject = failure;
      }),
  );
  render(<NotificationInbox />);
  fireEvent.click(screen.getByRole("button", { name: "อ่านทั้งหมด" }));
  expect(
    screen.getByRole<HTMLButtonElement>("button", { name: "กำลังบันทึก…" })
      .disabled,
  ).toBe(true);
  reject(new Error("offline"));
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toContain(
      "บันทึกสถานะการอ่านไม่สำเร็จ",
    ),
  );
  expect(
    screen.getByRole<HTMLButtonElement>("button", { name: "อ่านทั้งหมด" })
      .disabled,
  ).toBe(false);
  expect(
    screen
      .getAllByRole("link")
      .every((link) => link.getAttribute("data-unread") === "true"),
  ).toBe(true);
});
