import {
  fireEvent,
  render,
  screen,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import XPDashboard from "./XPDashboard";
const mocks = vi.hoisted(() => ({
  summary: vi.fn(),
  events: vi.fn(),
  board: vi.fn(),
  settings: vi.fn(),
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
  minimum_days: 3,
  next_label: "ผู้ร่วมดูแลอากาศ",
  next_xp: 500,
  next_days: 7,
};
const summary = {
  member_id: "public-id",
  alias: "สายลม",
  hidden: false,
  lifetime_xp: 180,
  contribution_days: 4,
  rank,
  achievements: ["รายงานแรก"],
  today_reports: 2,
  today_help: 1,
};
beforeEach(() => {
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
it("separates lifetime progress from rolling leaderboard filters", async () => {
  render(<XPDashboard />);
  expect(await screen.findByText("สายลม")).toBeTruthy();
  expect(await screen.findByText("ฟ้าใส")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "7 วัน" }));
  await waitFor(() => expect(mocks.board).toHaveBeenLastCalledWith("7d"));
  expect(screen.getByText(/180\/500 XP/)).toBeTruthy();
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
  fireEvent.click(screen.getByText("ชื่อและความเป็นส่วนตัว"));
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
  });
  expect(screen.getByText(/180\/500 XP/)).toBeTruthy();
});
it("does not let an older period response replace the currently selected period", async () => {
  let resolveOld: (value: unknown) => void = () => undefined;
  mocks.board.mockImplementation((period) =>
    period === "all"
      ? new Promise((resolve) => {
          resolveOld = resolve;
        })
      : Promise.resolve({ period, users: [], me: null, next_offset: null }),
  );
  render(<XPDashboard />);
  await screen.findByText("สายลม");
  fireEvent.click(screen.getByRole("button", { name: "30 วัน" }));
  await screen.findByText("ยังไม่มีผลงานที่ได้รับ XP ในช่วงนี้");
  resolveOld({
    period: "all",
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
  expect(screen.queryByText("ประวัติ XP ส่วนตัว")).toBeNull();
  expect(screen.queryByText("อันดับของฉัน")).toBeNull();
});
