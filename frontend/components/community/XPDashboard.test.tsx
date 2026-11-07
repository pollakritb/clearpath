import {
  fireEvent,
  render,
  screen,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { clearAccountData } from "@/frontend/lib/account-data-cache";
import XPDashboard from "./XPDashboard";
const mocks = vi.hoisted(() => ({
  summary: vi.fn(),
  events: vi.fn(),
  board: vi.fn(),
  settings: vi.fn(),
}));
vi.mock("@/frontend/components/auth/AuthProvider", () => ({
  useCurrentUserId: () => "test-owner",
  useAuth: () => ({ user: null }),
}));
vi.mock("@/frontend/lib/api-client", () => ({
  api: {
    xpSummary: mocks.summary,
    xpEvents: mocks.events,
    myLeaderboard: mocks.board,
    leaderboard: mocks.board,
    xpSettings: mocks.settings,
  },
  apiErrorMessage: (_e: unknown, f: string) => f,
}));
const rank = {
  code: "reporter",
  label: "ผู้รายงานชุมชน",
  minimum_xp: 100,
  minimum_days: 0,
  next_label: "ผู้ร่วมดูแลอากาศ",
  next_xp: 500,
  next_days: 0,
};
const summary = {
  member_id: "public-id",
  alias: "สายลม",
  hidden: false,
  identity_mode: "alias",
  lifetime_xp: 180,
  contribution_days: 4,
  rank,
  achievements: ["รายงานแรก"],
  today_reports: 2,
  today_help: 1,
};
beforeEach(() => {
  clearAccountData();
  vi.clearAllMocks();
  mocks.summary.mockResolvedValue(summary);
  mocks.events.mockResolvedValue({ events: [], next_offset: null });
  mocks.board.mockImplementation(async (period) => ({
    period,
    users: [
      {
        member_id: "leader",
        alias: "ฟ้าใส",
        xp: 50,
        lifetime_xp: 600,
        rank: 1,
        title: rank,
      },
    ],
    me: { rank: 2, xp: 30 },
    next_offset: null,
  }));
});
afterEach(cleanup);
it("separates lifetime progress from calendar-month leaderboard filters", async () => {
  render(<XPDashboard />);
  expect(await screen.findByText("สายลม")).toBeTruthy();
  expect(await screen.findByText("ฟ้าใส")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "ทั้งหมด" }));
  await waitFor(() => expect(mocks.board).toHaveBeenLastCalledWith("all"));
  expect(screen.getByText(/180\/500 คะแนน/)).toBeTruthy();
  expect(screen.getByText(/อันดับการมีส่วนร่วม/)).toBeTruthy();
});
it("saves the ClearPath alias and leaderboard opt-out without erasing XP", async () => {
  mocks.settings.mockResolvedValue({
    ...summary,
    hidden: true,
    alias: "ฟ้าใหม่",
  });
  render(<XPDashboard />);
  await screen.findByText("สายลม");
  fireEvent.click(screen.getByText("ชื่อที่แสดงในอันดับ"));
  fireEvent.change(screen.getByLabelText("นามแฝง ClearPath"), {
    target: { value: "ฟ้าใหม่" },
  });
  fireEvent.click(
    screen.getByRole("checkbox", { name: "ซ่อนฉันจากตารางอันดับ" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "บันทึก" }));
  await screen.findByText("บันทึกการแสดงชื่อแล้ว");
  expect(mocks.settings).toHaveBeenCalledWith({
    alias: "ฟ้าใหม่",
    hidden: true,
    identity_mode: "alias",
  });
  expect(screen.getByText(/180\/500 คะแนน/)).toBeTruthy();
});
it("does not let an older period response replace the currently selected period", async () => {
  let resolveOld: (value: unknown) => void = () => undefined;
  mocks.board.mockImplementation((period) =>
    period === "month"
      ? new Promise((resolve) => {
          resolveOld = resolve;
        })
      : Promise.resolve({ period, users: [], me: null, next_offset: null }),
  );
  render(<XPDashboard />);
  await screen.findByText("สายลม");
  fireEvent.click(screen.getByRole("button", { name: "ทั้งหมด" }));
  await screen.findByText("ยังไม่มีผลงานที่ได้รับคะแนน ในช่วงนี้");
  resolveOld({
    period: "month",
    users: [{ member_id: "old", alias: "OLD RESPONSE", xp: 99, title: rank }],
    me: null,
    next_offset: null,
  });
  await waitFor(() => expect(screen.queryByText("OLD RESPONSE")).toBeNull());
});

it("lets guests see public ranks without requesting private XP history", async () => {
  render(<XPDashboard signedIn={false} />);
  await screen.findByText("ฟ้าใส");
  expect(mocks.summary).not.toHaveBeenCalled();
  expect(mocks.events).not.toHaveBeenCalled();
  expect(screen.queryByText("ประวัติคะแนนส่วนตัว")).toBeNull();
  expect(screen.queryByText("อันดับของฉัน")).toBeNull();
});

it("loads personal progress without the leaderboard in the overview", async () => {
  render(<XPDashboard section="overview" />);
  await screen.findByText("สายลม");
  expect(mocks.board).not.toHaveBeenCalled();
  expect(screen.queryByRole("region", { name: "อันดับชุมชน" })).toBeNull();
  expect(screen.getByText("ประวัติคะแนนส่วนตัว")).toBeTruthy();
});

it("keeps personal history out of the standalone leaderboard section", async () => {
  render(<XPDashboard section="leaderboard" />);
  await screen.findByText("ฟ้าใส");
  expect(mocks.summary).not.toHaveBeenCalled();
  expect(mocks.events).not.toHaveBeenCalled();
  expect(screen.queryByRole("region", { name: "คะแนนและยศของฉัน" })).toBeNull();
});

it("reuses the overview immediately after leaving and reopening the page", async () => {
  const page = render(<XPDashboard section="overview" />);
  await screen.findByText("สายลม");
  page.unmount();
  render(<XPDashboard section="overview" />);
  expect(screen.getByText("สายลม")).toBeTruthy();
  expect(screen.queryByText("กำลังโหลดผลงาน…")).toBeNull();
  await waitFor(() => expect(mocks.summary).toHaveBeenCalledTimes(1));
});

it("offers retry instead of leaving a failed leaderboard stuck loading", async () => {
  mocks.board.mockRejectedValueOnce(new Error("offline"));
  render(<XPDashboard section="leaderboard" />);
  await screen.findByText("โหลดอันดับไม่สำเร็จ");
  expect(screen.queryByText("กำลังโหลดอันดับ…")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "ลองใหม่" }));
  await screen.findByText("ฟ้าใส");
});

it("lets the member explicitly choose Google for leaderboard identity", async () => {
  mocks.settings.mockResolvedValue({ ...summary, identity_mode: "google" });
  render(<XPDashboard />);
  await screen.findByText("สายลม");
  fireEvent.click(screen.getByText("ชื่อที่แสดงในอันดับ"));
  fireEvent.change(screen.getByLabelText("แสดงตัวตนในอันดับและโปรไฟล์ชุมชน"), {
    target: { value: "google" },
  });
  fireEvent.click(screen.getByRole("button", { name: "บันทึก" }));
  await waitFor(() =>
    expect(mocks.settings).toHaveBeenCalledWith({
      alias: "สายลม",
      hidden: false,
      identity_mode: "google",
    }),
  );
});

it("shows XP-only rank progress even for a member with no contribution days", async () => {
  mocks.summary.mockResolvedValue({ ...summary, contribution_days: 0 });
  render(<XPDashboard section="overview" />);
  await screen.findByText(/180\/500 คะแนน/);
  expect(screen.queryByText(/ผลงาน 0\//)).toBeNull();
});

it("explains an unlaunched monthly season and links back to preserved lifetime points", async () => {
  mocks.board.mockImplementation(async (period) => ({
    period,
    month: period === "month" ? "2026-11" : null,
    launched_at: null,
    provisional: true,
    users: [],
    me: null,
    next_offset: null,
  }));
  render(<XPDashboard section="leaderboard" />);
  await screen.findByText(/อันดับเดือนนี้จะเริ่มเมื่อเปิดกติกาใหม่/);
  expect(screen.queryByText(/รอสรุปผล 72/)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "ดูคะแนนสะสมทั้งหมด" }));
  await waitFor(() => expect(mocks.board).toHaveBeenLastCalledWith("all"));
});

it("announces the scheduled v3 month boundary while preserving existing lifetime XP", async () => {
  mocks.summary.mockResolvedValue({
    ...summary,
    scheduled_policy_version: "contribution-v3",
    scheduled_starts_at: "2026-12-01T00:00:00+07:00",
  });
  render(<XPDashboard />);
  expect(await screen.findByText(/กติกา contribution-v3 เริ่ม/)).toBeTruthy();
  expect(screen.getByText(/คะแนนและยศเดิมยังอยู่ครบ/)).toBeTruthy();
  expect(screen.getByText(/180\/500 คะแนน/)).toBeTruthy();
});
