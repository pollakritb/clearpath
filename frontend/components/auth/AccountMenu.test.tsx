import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import AccountMenu from "./AccountMenu";
import {
  accountKey,
  clearAccountData,
  updateAccountData,
} from "@/frontend/lib/account-data-cache";

const mocks = vi.hoisted(() => ({
  summary: vi.fn(),
  account: "member-a" as string | null,
}));
vi.mock("./AuthProvider", () => ({
  useCurrentUserId: () => mocks.account,
  useAuth: () => ({
    user: mocks.account
      ? {
          id: mocks.account,
          email: "member@example.test",
          user_metadata: {
            full_name: "Member",
            avatar_url: "https://lh3.googleusercontent.com/a/member",
          },
        }
      : null,
    localDemo: false,
    loading: false,
    role: "user",
  }),
}));
vi.mock("./AuthControl", () => ({
  default: () => <button>เข้าสู่ระบบ</button>,
}));
vi.mock("@/frontend/lib/api-client", () => ({
  api: { xpSummary: mocks.summary },
}));
const rank = (code = "guardian", label = "ผู้พิทักษ์อากาศ") => ({
  code,
  label,
  minimum_xp: 1500,
  minimum_days: 20,
  next_label: null,
  next_xp: null,
  next_days: null,
});
beforeEach(() => {
  clearAccountData();
  vi.clearAllMocks();
  mocks.account = "member-a";
  mocks.summary.mockResolvedValue({ rank: rank() });
});
afterEach(cleanup);

it("attaches the current rank to the profile picture without replacing the photo", async () => {
  const { container } = render(<AccountMenu />);
  const trigger = screen.getByRole("button", { name: "เปิดโปรไฟล์" });
  await waitFor(() =>
    expect(trigger.querySelector('[data-rank="guardian"]')).not.toBeNull(),
  );
  expect(trigger.querySelector("img")?.getAttribute("src")).toContain(
    "googleusercontent.com",
  );
  expect(
    container.querySelector(".cp-account-dialog .cp-xp-badge")?.textContent,
  ).toContain("ผู้พิทักษ์อากาศ");
  expect(trigger.getAttribute("title")).toContain("ผู้พิทักษ์อากาศ");
});
it("keeps the emblem when the remote profile photo fails", async () => {
  render(<AccountMenu />);
  const trigger = screen.getByRole("button", { name: "เปิดโปรไฟล์" });
  await waitFor(() =>
    expect(trigger.querySelector(".cp-rank-emblem")).not.toBeNull(),
  );
  fireEvent.error(trigger.querySelector("img")!);
  expect(trigger.querySelector("img")).toBeNull();
  expect(
    trigger.querySelector('.cp-rank-emblem[data-rank="guardian"]'),
  ).not.toBeNull();
});
it("shares summary cache across instances and updates the rank without remounting", async () => {
  const { container } = render(
    <>
      <AccountMenu />
      <AccountMenu />
    </>,
  );
  await waitFor(() =>
    expect(
      container.querySelectorAll('.cp-account-trigger [data-rank="guardian"]'),
    ).toHaveLength(2),
  );
  expect(mocks.summary).toHaveBeenCalledOnce();
  act(() =>
    updateAccountData(accountKey("member-a", "xp-summary"), {
      rank: rank("champion", "แกนนำอากาศสะอาด"),
    }),
  );
  expect(
    container.querySelectorAll('.cp-account-trigger [data-rank="champion"]'),
  ).toHaveLength(2);
});
it("removes the previous member's rank on account change or logout", async () => {
  const { container, rerender } = render(<AccountMenu />);
  await waitFor(() =>
    expect(
      container.querySelector(".cp-account-trigger .cp-rank-emblem"),
    ).not.toBeNull(),
  );
  mocks.account = "member-b";
  mocks.summary.mockReturnValue(new Promise(() => {}));
  rerender(<AccountMenu />);
  expect(
    container.querySelector(".cp-account-trigger .cp-rank-emblem"),
  ).toBeNull();
  mocks.account = null;
  rerender(<AccountMenu />);
  expect(
    container.querySelector(".cp-account-trigger .cp-rank-emblem"),
  ).toBeNull();
});
it("does not invent a rank when XP is disabled", async () => {
  mocks.summary.mockResolvedValue(null);
  const { container } = render(<AccountMenu />);
  await waitFor(() => expect(mocks.summary).toHaveBeenCalledOnce());
  expect(container.querySelector(".cp-rank-emblem")).toBeNull();
});
