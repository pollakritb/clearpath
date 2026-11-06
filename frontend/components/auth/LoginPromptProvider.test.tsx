import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  user: null,
  role: "user" as const,
  loading: false,
  configured: true,
  localDemo: false,
  signInWithGoogle: vi.fn(async () => undefined),
  signInWithOtp: vi.fn(async () => undefined),
  signOut: vi.fn(async () => undefined),
}));

vi.mock("./AuthProvider", () => ({
  useAuth: () => authState,
}));

import { LoginPromptProvider, useLoginPrompt } from "./LoginPromptProvider";

function ProtectedFeature() {
  const prompt = useLoginPrompt();
  return (
    <button
      type="button"
      onClick={() =>
        prompt.openLoginPrompt({
          title: "เข้าสู่ระบบก่อนส่งข้อมูล",
          description: "ใช้บัญชี Google เพื่อส่งรายงาน",
        })
      }
    >
      เปิดฟีเจอร์
    </button>
  );
}

beforeEach(() => {
  authState.configured = true;
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    }),
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: vi.fn(function (this: HTMLDialogElement) {
      this.removeAttribute("open");
    }),
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("opens a Google sign-in dialog for a protected feature and closes it", () => {
  render(
    <LoginPromptProvider>
      <ProtectedFeature />
    </LoginPromptProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "เปิดฟีเจอร์" }));
  expect(screen.getByRole("dialog").textContent).toContain(
    "เข้าสู่ระบบก่อนส่งข้อมูล",
  );
  expect(
    screen.getByRole<HTMLButtonElement>("button", {
      name: "เข้าสู่ระบบด้วย Google",
    }).disabled,
  ).toBe(false);
  fireEvent.click(
    screen.getByRole("button", { name: "ปิดหน้าต่างเข้าสู่ระบบ" }),
  );
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("opens a native modal, locks page scrolling, and restores focus after cancel", () => {
  render(
    <LoginPromptProvider>
      <ProtectedFeature />
    </LoginPromptProvider>,
  );
  const trigger = screen.getByRole("button", { name: "เปิดฟีเจอร์" });
  trigger.focus();
  fireEvent.click(trigger);
  const dialog = screen.getByRole("dialog");
  expect(dialog.tagName).toBe("DIALOG");
  expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledOnce();
  expect(document.body.style.overflow).toBe("hidden");
  fireEvent(dialog, new Event("cancel", { bubbles: false, cancelable: true }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.body.style.overflow).not.toBe("hidden");
  expect(document.activeElement).toBe(trigger);
});

it("explains unavailable sign-in without exposing configuration names", () => {
  authState.configured = false;
  render(
    <LoginPromptProvider>
      <ProtectedFeature />
    </LoginPromptProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "เปิดฟีเจอร์" }));
  expect(screen.getByRole("alert").textContent).toContain(
    "กรุณาลองใหม่ภายหลัง",
  );
  expect(screen.getByRole("dialog").textContent).not.toContain("NEXT_PUBLIC");
});
