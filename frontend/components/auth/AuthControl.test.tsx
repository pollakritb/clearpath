import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import AuthControl from "./AuthControl";
const state = vi.hoisted(() => ({
  loading: false,
  localDemo: false,
  user: null,
  configured: true,
  signInWithGoogle: vi.fn(),
  signInWithOtp: vi.fn(),
}));
vi.mock("./AuthProvider", () => ({ useAuth: () => state }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("shows a Google sign-in error and permits a retry", async () => {
  state.signInWithGoogle
    .mockRejectedValueOnce(new Error("เชื่อมต่อไม่ได้"))
    .mockResolvedValueOnce(undefined);
  render(<AuthControl compact />);
  fireEvent.click(
    screen.getByRole("button", { name: "เข้าสู่ระบบด้วย Google" }),
  );
  await screen.findByRole("alert");
  fireEvent.click(
    screen.getByRole("button", { name: "เข้าสู่ระบบด้วย Google" }),
  );
  await waitFor(() => expect(state.signInWithGoogle).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
});
it("OTP failure is recoverable and a successful retry confirms delivery", async () => {
  state.signInWithOtp
    .mockRejectedValueOnce(new Error("ส่งไม่สำเร็จ"))
    .mockResolvedValueOnce(undefined);
  render(<AuthControl />);
  fireEvent.change(
    screen.getByRole("textbox", { name: "อีเมลสำหรับเข้าสู่ระบบ" }),
    { target: { value: "flow@example.test" } },
  );
  fireEvent.submit(
    screen.getByRole("button", { name: "ส่ง OTP" }).closest("form")!,
  );
  await screen.findByRole("alert");
  fireEvent.submit(
    screen.getByRole("button", { name: "ส่ง OTP" }).closest("form")!,
  );
  await screen.findByText("ส่งลิงก์เข้าสู่ระบบไปที่อีเมลแล้ว");
  expect(state.signInWithOtp).toHaveBeenLastCalledWith("flow@example.test");
});
