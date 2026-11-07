import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import CommunityTrustCard from "./CommunityTrustCard";
import type { CommunityTrust } from "@/frontend/types/community-trust";
afterEach(cleanup);
const trust: CommunityTrust = {
  policy_version: "community-trust-v1",
  status: "insufficient",
  score: null,
  window_start: "2026-08-10",
  window_end: "2026-11-07",
  unique_voter_accounts: 0,
  evaluated_report_count: 0,
  evaluated_day_count: 0,
  effective_day_weight: 0,
  last_feedback_at: null,
  calculated_at: null,
  contribution_days_30: 8,
  review_available: false,
  daily: [],
};
it("does not invent a zero when evidence is insufficient", () => {
  render(<CommunityTrustCard trust={trust} />);
  expect(screen.getByText("เสียงประเมินยังไม่เพียงพอ")).toBeTruthy();
  expect(screen.queryByText("0.0/100")).toBeNull();
  expect(screen.getByText(/ช่วยรายงาน 8 วัน/)).toBeTruthy();
});
it("shows a valid zero score separately from participation", () => {
  render(
    <CommunityTrustCard
      trust={{
        ...trust,
        status: "available",
        score: 0,
        unique_voter_accounts: 3,
        evaluated_report_count: 3,
        evaluated_day_count: 3,
      }}
    />,
  );
  expect(screen.getByText("0.0/100")).toBeTruthy();
  expect(screen.getByText(/บัญชีผู้ประเมิน 3 บัญชี/)).toBeTruthy();
});
it("keeps the last score labeled when a projection is updating", () => {
  render(
    <CommunityTrustCard
      trust={{ ...trust, status: "updating", score: 78.571428 }}
    />,
  );
  expect(screen.getByText("กำลังอัปเดต")).toBeTruthy();
  expect(screen.getByText(/ค่าล่าสุด 78.6\/100/)).toBeTruthy();
});
it("hides the whole score surface when feature or identity is private", () => {
  const { container } = render(<CommunityTrustCard trust={null} />);
  expect(container.textContent).toBe("");
});
