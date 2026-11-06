import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  subject: "owner",
  status: vi.fn(),
  export: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("@/frontend/components/auth/AuthProvider", () => ({
  useAuth: () => ({
    user: { id: mocks.subject },
    localDemo: false,
    signInWithGoogle: vi.fn(),
  }),
}));
vi.mock("@/frontend/lib/api-client", () => ({
  api: {
    accountPrivacy: mocks.status,
    accountExport: mocks.export,
    requestDeletion: mocks.remove,
  },
  apiErrorMessage: (_error: unknown, fallback: string) => fallback,
}));
import AccountPrivacyPanel from "./AccountPrivacyPanel";
const status = {
  enabled: true,
  requests: [],
  export_sections: ["reports", "points"],
  automatic_deletion: false,
};
beforeEach(() => {
  mocks.subject = "owner";
  mocks.status.mockReset().mockResolvedValue(status);
  mocks.export.mockReset();
  mocks.remove.mockReset();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("does not create a partial download when a later section fails", async () => {
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(() => {});
  mocks.export
    .mockResolvedValueOnce({ items: [{ id: "mine" }], next_offset: null })
    .mockRejectedValueOnce(new Error("timeout"));
  render(<AccountPrivacyPanel />);
  fireEvent.click(
    await screen.findByRole("button", { name: "ดาวน์โหลดข้อมูล JSON" }),
  );
  await screen.findByText(/ไม่มีการบันทึกไฟล์ที่ไม่ครบ/);
  expect(click).not.toHaveBeenCalled();
});
it("abandons the previous account export when the account changes", async () => {
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(() => {});
  let finish!: (data: unknown) => void;
  mocks.export.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const view = render(<AccountPrivacyPanel />);
  fireEvent.click(
    await screen.findByRole("button", { name: "ดาวน์โหลดข้อมูล JSON" }),
  );
  mocks.subject = "another-owner";
  view.rerender(<AccountPrivacyPanel />);
  await act(async () =>
    finish({ items: [{ id: "old-owner-private-data" }], next_offset: null }),
  );
  expect(mocks.export).toHaveBeenCalledTimes(1);
  expect(click).not.toHaveBeenCalled();
});
it("requires both confirmations and displays pending rather than completed deletion", async () => {
  mocks.remove.mockImplementation(async () => {
    mocks.status.mockResolvedValue({
      ...status,
      requests: [
        {
          id: "request1",
          status: "pending",
          created_at: "2026-01-01",
          completed_at: null,
        },
      ],
    });
    return { id: "request1", status: "pending" };
  });
  render(<AccountPrivacyPanel />);
  fireEvent.click(
    await screen.findByText("ส่งคำขอลบบัญชี", { selector: "summary" }),
  );
  const submit = screen.getByRole("button", { name: "ยืนยันส่งคำขอ" });
  expect((submit as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "ลบบัญชี" },
  });
  expect((submit as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(submit);
  await waitFor(() => expect(mocks.remove).toHaveBeenCalledOnce());
  await screen.findByText(/รับคำขอแล้ว ·/);
  expect(
    screen.getByText("รับคำขอลบบัญชีแล้ว ยังไม่ได้ลบข้อมูลหรือบัญชี"),
  ).toBeTruthy();
});
