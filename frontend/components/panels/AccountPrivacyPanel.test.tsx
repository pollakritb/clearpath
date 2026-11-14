import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  subject: "owner",
  loading: false,
  signin: vi.fn(),
  signout: vi.fn(),
  status: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("@/frontend/components/auth/AuthProvider", () => ({
  useAuth: () => ({
    user: mocks.subject ? { id: mocks.subject } : null,
    loading: mocks.loading,
    localDemo: false,
    signInWithGoogle: mocks.signin,
    signOut: mocks.signout,
  }),
}));
vi.mock("@/frontend/lib/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/frontend/lib/api-client")>()),
  api: { accountPrivacy: mocks.status, requestDeletion: mocks.remove },
}));
import AccountPrivacyPanel from "./AccountPrivacyPanel";
import { ApiError } from "@/frontend/lib/api-client";
const status = {
  enabled: true,
  requests: [],
  export_sections: ["reports"],
  automatic_deletion: true,
};
beforeEach(() => {
  mocks.subject = "owner";
  mocks.loading = false;
  mocks.status.mockReset().mockResolvedValue(status);
  mocks.remove.mockReset();
  mocks.signin.mockReset().mockResolvedValue(undefined);
  mocks.signout.mockReset().mockResolvedValue(undefined);
});
afterEach(cleanup);
it("only presents the deletion action without export or an upfront reauthentication prompt", async () => {
  render(<AccountPrivacyPanel />);
  await screen.findByText("ลบบัญชี", { selector: "summary" });
  expect(screen.queryByText(/ดาวน์โหลด/)).toBeNull();
  expect(
    screen.queryByRole("button", { name: "ยืนยันตัวตนด้วย Google" }),
  ).toBeNull();
  expect(screen.queryByText(/ประวัติคำขอ/)).toBeNull();
});
it("explains disabled deletion and can refresh availability", async () => {
  mocks.status.mockResolvedValueOnce({ ...status, enabled: false });
  render(<AccountPrivacyPanel />);
  await screen.findByText("การส่งคำขอลบบัญชียังไม่เปิดใช้งาน");
  expect(screen.queryByText("ลบบัญชี", { selector: "summary" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "ตรวจสอบสถานะอีกครั้ง" }));
  await screen.findByText("ลบบัญชี", { selector: "summary" });
});
it("lets a guest sign in without querying account data", async () => {
  mocks.subject = "";
  render(<AccountPrivacyPanel />);
  expect(mocks.status).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: "เข้าสู่ระบบด้วย Google" }),
  );
  await waitFor(() => expect(mocks.signin).toHaveBeenCalledOnce());
});
it("offers retry after a status failure", async () => {
  mocks.status.mockRejectedValueOnce(new Error("offline"));
  render(<AccountPrivacyPanel />);
  await screen.findByText("ยังโหลดข้อมูลบัญชีไม่ได้");
  fireEvent.click(screen.getByRole("button", { name: "ลองโหลดใหม่" }));
  await screen.findByText("ลบบัญชี", { selector: "summary" });
});
it("does not offer sign in before identity loading ends", () => {
  mocks.subject = "";
  mocks.loading = true;
  render(<AccountPrivacyPanel />);
  expect(screen.getByText("กำลังตรวจสอบบัญชี")).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: "เข้าสู่ระบบด้วย Google" }),
  ).toBeNull();
});
async function confirm() {
  fireEvent.click(await screen.findByText("ลบบัญชี", { selector: "summary" }));
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "ลบบัญชี" },
  });
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "ยืนยันลบบัญชี" }));
}
it("requires both confirmations and shows a pending request rather than claiming deletion", async () => {
  const row = {
    id: "r1",
    status: "pending",
    created_at: "2026-01-01",
    completed_at: null,
  };
  mocks.remove.mockImplementation(async () => {
    mocks.status.mockResolvedValue({ ...status, requests: [row] });
    return row;
  });
  render(<AccountPrivacyPanel />);
  fireEvent.click(await screen.findByText("ลบบัญชี", { selector: "summary" }));
  const button = screen.getByRole("button", {
    name: "ยืนยันลบบัญชี",
  }) as HTMLButtonElement;
  expect(button.disabled).toBe(true);
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "ลบบัญชี" },
  });
  expect(button.disabled).toBe(true);
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(button);
  await screen.findByText("กำลังดำเนินการลบบัญชี");
  expect(mocks.remove).toHaveBeenCalledExactlyOnceWith({
    confirmation: "ลบบัญชี",
    acknowledges_retention: true,
  });
  expect(
    screen.getByText("บัญชีถูกปิดการใช้งานแล้ว ระบบจะดำเนินการต่อโดยอัตโนมัติ"),
  ).toBeTruthy();
  expect(screen.queryByText("ลบบัญชี", { selector: "summary" })).toBeNull();
});
it("only offers reauthentication when the deletion endpoint requires it", async () => {
  mocks.remove.mockRejectedValueOnce(
    new ApiError("กรุณาเข้าสู่ระบบใหม่ก่อนจัดการข้อมูลบัญชี", 403),
  );
  render(<AccountPrivacyPanel />);
  await confirm();
  fireEvent.click(
    await screen.findByRole("button", { name: "ยืนยันตัวตนด้วย Google" }),
  );
  await waitFor(() => expect(mocks.signin).toHaveBeenCalledOnce());
  expect(mocks.remove).toHaveBeenCalledTimes(1);
});
it("does not show another deletion form while processing", async () => {
  mocks.status.mockResolvedValue({
    ...status,
    requests: [
      {
        id: "r1",
        status: "processing",
        created_at: "2026-01-01",
        completed_at: null,
      },
    ],
  });
  render(<AccountPrivacyPanel />);
  await screen.findByText(/รับคำขอแล้ว · อยู่ระหว่างดำเนินการ/);
  expect(screen.queryByText("ลบบัญชี", { selector: "summary" })).toBeNull();
});

it("shows completion only after server confirmation and clears the local session", async () => {
  mocks.remove.mockResolvedValue({
    id: "done",
    status: "completed",
    created_at: "2026-11-14",
    completed_at: "2026-11-14",
  });
  render(<AccountPrivacyPanel />);
  await confirm();
  await screen.findByText("ลบบัญชี ClearPath แล้ว");
  expect(mocks.signout).toHaveBeenCalledWith({ localOnly: true });
  expect(screen.queryByText("ลบบัญชี", { selector: "summary" })).toBeNull();
});

it("does not reuse the previous account closure receipt after switching accounts", async () => {
  mocks.remove.mockResolvedValue({
    id: "done",
    status: "completed",
    created_at: "2026-11-14",
    completed_at: "2026-11-14",
  });
  const { rerender } = render(<AccountPrivacyPanel />);
  await confirm();
  await screen.findByText("ลบบัญชี ClearPath แล้ว");
  mocks.subject = "different-owner";
  rerender(<AccountPrivacyPanel />);
  await screen.findByText("ลบบัญชี", { selector: "summary" });
  expect(screen.queryByText("ลบบัญชี ClearPath แล้ว")).toBeNull();
});
