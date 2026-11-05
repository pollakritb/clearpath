import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
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
vi.mock("@/frontend/lib/api-client", () => ({
  api: {
    reportXP: () => Promise.resolve(reward),
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
