import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import type { CommunityReport } from "@/frontend/types";
import ReportEvidencePanel from "./ReportEvidencePanel";
afterEach(cleanup);
it("explains incomplete evidence without calling it measurement accuracy", () => {
  const report = {
    evidence_policy: "evidence-v2",
    eligible_for_gap_fill: false,
    eligibility_reason: "หลักฐานสำคัญยังไม่ครบ",
    evidence: {
      score: 90,
      policy_version: "evidence-v2",
      device_status: "unknown",
      components: [
        {
          code: "unit_verified",
          points: 0,
          maximum: 10,
          state: "unknown",
          reason: "ยังยืนยันหน่วยไม่ได้",
        },
      ],
      blockers: ["unit_verified"],
    },
  } as CommunityReport;
  render(<ReportEvidencePanel report={report} />);
  expect(
    screen.getByRole("heading", { name: "หลักฐานรายงาน 90/100" }),
  ).toBeTruthy();
  expect(screen.getByText(/ไม่ใช่เปอร์เซ็นต์ความแม่นยำ/)).toBeTruthy();
  expect(screen.getByText(/ยังไม่ทราบข้อมูลเครื่อง/)).toBeTruthy();
  expect(screen.getByText("ยังยืนยันหน่วยไม่ได้")).toBeTruthy();
  expect(screen.getByText("หลักฐานสำคัญยังไม่ครบ")).toBeTruthy();
});
it("leaves legacy reports unscored by the new rubric", () => {
  render(
    <ReportEvidencePanel
      report={
        {
          evidence_policy: "evidence-v2",
          evidence: null,
          eligibility_reason: "ยังไม่มีหลักฐานรุ่นใหม่",
        } as CommunityReport
      }
    />,
  );
  expect(screen.getByText(/ยังไม่มีข้อมูลรุ่นใหม่/)).toBeTruthy();
  expect(screen.queryByText(/0\/100/)).toBeNull();
});
