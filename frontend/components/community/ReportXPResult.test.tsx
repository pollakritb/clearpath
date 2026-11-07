import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ReportXPResult from "./ReportXPResult";
const reward = {
  status: "granted" as const,
  report_xp: 10,
  help_xp: 5,
  first_day_xp: 5,
  week_xp: 20,
  matched_request_count: 5,
  reason: null,
  bonus_reason: null,
};
const mocks = vi.hoisted(() => ({ reward: vi.fn() }));
beforeEach(() => {
  mocks.reward.mockResolvedValue(reward);
});
vi.mock("@/frontend/lib/api-client", () => ({
  api: {
    reportXP: mocks.reward,
    xpSummary: () => Promise.resolve(null),
  },
}));
afterEach(cleanup);
it("includes daily and weekly bonuses but never multiplies by fulfilled requests", async () => {
  render(<ReportXPResult reportId="RPT-fixture" initial={reward} />);
  expect(await screen.findByText("ได้รับ +40 คะแนน")).toBeTruthy();
  expect(screen.getByText(/รายงานแรกของวัน \+5/)).toBeTruthy();
  expect(screen.getByText(/ครบ 5 วันในสัปดาห์ \+20/)).toBeTruthy();
  expect(screen.getByText("รายงานนี้ช่วยตอบ 5 คำขอ")).toBeTruthy();
});

it("explains bonus-only XP after report quota without conflating publication", async () => {
  const only = {
    ...reward,
    report_xp: 0,
    first_day_xp: 0,
    week_xp: 0,
    reason: "วันนี้รับคะแนนรายงานครบแล้ว",
  };
  mocks.reward.mockResolvedValue(only);
  render(<ReportXPResult reportId="RPT-bonus-only" initial={only} />);
  expect(await screen.findByText("ได้รับ +5 คะแนน")).toBeTruthy();
  expect(screen.getByText(/วันนี้รับคะแนนรายงานครบแล้ว/)).toBeTruthy();
  expect(screen.getByText(/ช่วยคำขอ \+5/)).toBeTruthy();
});
it("retains a pending message rather than inventing zero during processing", () => {
  mocks.reward.mockReturnValue(new Promise(() => {}));
  render(
    <ReportXPResult
      reportId="RPT-pending"
      initial={{ ...reward, status: "pending" }}
    />,
  );
  expect(screen.getByText(/กำลังบันทึกคะแนน/)).toBeTruthy();
  expect(screen.queryByText(/ไม่ได้รับคะแนน/)).toBeNull();
});

it("does not display a previous report award while the next report is pending", async () => {
  let finishOld!: (value: typeof reward) => void;
  const old = new Promise<typeof reward>((resolve) => {
    finishOld = resolve;
  });
  mocks.reward
    .mockReturnValueOnce(old)
    .mockReturnValueOnce(new Promise(() => {}));
  const view = render(<ReportXPResult reportId="RPT-old" initial={reward} />);
  expect(screen.getByText("ได้รับ +40 คะแนน")).toBeTruthy();
  view.rerender(
    <ReportXPResult
      reportId="RPT-new"
      initial={{ ...reward, status: "pending" }}
    />,
  );
  expect(screen.queryByText("ได้รับ +40 คะแนน")).toBeNull();
  expect(screen.getByText(/กำลังบันทึกคะแนน/)).toBeTruthy();
  await act(async () => {
    finishOld(reward);
    await old;
  });
  expect(screen.queryByText("ได้รับ +40 คะแนน")).toBeNull();
});
it("shows pending feedback when no initial XP response is available", () => {
  mocks.reward.mockReturnValue(new Promise(() => {}));
  render(<ReportXPResult reportId="RPT-awaiting" />);
  expect(screen.getByText(/กำลังบันทึกคะแนน/)).toBeTruthy();
  expect(screen.queryByText(/ไม่ได้รับคะแนน/)).toBeNull();
});
