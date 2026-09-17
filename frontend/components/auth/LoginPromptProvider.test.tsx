import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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

describe("LoginPromptProvider", () => {
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
});
