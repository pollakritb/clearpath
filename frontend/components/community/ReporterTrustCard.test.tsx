import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import type { ReporterTrust } from "@/frontend/types/evidence";
import ReporterTrustCard from "./ReporterTrustCard";
afterEach(cleanup);
const empty: ReporterTrust = {
  policy_version: "reporter-trust-v1",
  status: "insufficient",
  validation_status: "candidate",
  score: null,
  passed: 0,
  problems: 0,
  unresolved: 0,
  evaluated: 0,
  excluded_cases: 0,
  prior_alpha: 2,
  prior_beta: 2,
  first_checked_at: null,
  last_checked_at: null,
};
it("does not show zero or neutral Trust without independent cases", () => {
  render(<ReporterTrustCard trust={empty} />);
  expect(screen.getByText("ยังไม่มีผลตรวจเพียงพอ")).toBeTruthy();
  expect(screen.queryByText(/50\/100|0\/100/)).toBeNull();
});
it("keeps score paired with sample count and labels the candidate formula", () => {
  render(
    <ReporterTrustCard
      trust={{
        ...empty,
        status: "evaluated",
        score: 83.3,
        evaluated: 20,
        passed: 18,
        problems: 2,
      }}
    />,
  );
  expect(screen.getByText(/83.3\/100 · ตรวจแล้ว 20 เคส/)).toBeTruthy();
  expect(screen.getByText("ทดลอง")).toBeTruthy();
});
it("does not create report Trust for hidden or disabled profile data", () => {
  const { container } = render(<ReporterTrustCard compact trust={null} />);
  expect(container.textContent).toBe("");
});
it("does not silently replace a failed lookup with an empty history", () => {
  render(<ReporterTrustCard trust={{ ...empty, status: "unavailable" }} />);
  expect(screen.getByText("ยังโหลดผลตรวจไม่ได้")).toBeTruthy();
  expect(screen.queryByText("ยังไม่มีผลตรวจเพียงพอ")).toBeNull();
});
