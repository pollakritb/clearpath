import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import ReportStackCard from "./ReportStackCard";
import type { CommunityReport, CommunityReportStack } from "@/frontend/types";

afterEach(cleanup);
const stack: CommunityReportStack = {
  id: "stack:a",
  lat: 14,
  lon: 100,
  report_ids: ["a", "b", "c"],
  report_count: 3,
  reporter_count: 2,
  latest_captured_at: "2026-11-01T12:00:00Z",
  pm25: 22,
  value_status: "average",
  contributing_count: 3,
  contributing_report_ids: ["a", "b", "c"],
};
const reports = ["a", "b", "c"].map(
  (id, index) =>
    ({
      id,
      user_id: index === 2 ? "bob" : "alice",
      display_name: index === 2 ? "Bob" : "Alice",
      show_reporter_profile: true,
      pm25: 22,
      captured_at: stack.latest_captured_at,
    }) as CommunityReport,
);
it("labels the mean by report count and GPS, including repeat reports", () => {
  const select = vi.fn();
  render(
    <ReportStackCard
      stack={stack}
      reports={reports}
      onSelectReport={select}
      onClose={vi.fn()}
    />,
  );
  expect(screen.getByText("3 รายงานจาก 2 คน")).toBeTruthy();
  expect(
    screen.getByText("ค่าเฉลี่ยจาก 3 รายงานที่ GPS คลาดเคลื่อนไม่เกิน 50 ม."),
  ).toBeTruthy();
  expect(screen.queryByText(/60 นาที/)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "ดูทั้ง 3 รายงาน" }));
  expect(screen.getByText(/รวมรายงานจากคนเดียวกัน/)).toBeTruthy();
  expect(screen.getAllByText("ใช้ในค่าเฉลี่ย")).toHaveLength(3);
  fireEvent.click(screen.getAllByRole("button", { name: /Alice/ })[0]);
  expect(select).toHaveBeenCalledWith(reports[0]);
});
it("explains missing GPS eligibility without blaming the time of measurement", () => {
  render(
    <ReportStackCard
      stack={{
        ...stack,
        value_status: "older",
        pm25: null,
        contributing_count: 0,
        contributing_report_ids: [],
      }}
      reports={reports}
      onSelectReport={vi.fn()}
      onClose={vi.fn()}
    />,
  );
  expect(
    screen.getByText("ไม่มีรายงานที่ GPS คลาดเคลื่อนไม่เกิน 50 ม."),
  ).toBeTruthy();
  expect(screen.queryByText(/60 นาที/)).toBeNull();
});
it("shows a single eligible reading as one report", () => {
  render(
    <ReportStackCard
      stack={{
        ...stack,
        value_status: "single",
        pm25: 10,
        contributing_count: 1,
        contributing_report_ids: ["a"],
      }}
      reports={reports}
      onSelectReport={vi.fn()}
      onClose={vi.fn()}
    />,
  );
  expect(
    screen.getByText("ค่าจาก 1 รายงานที่ GPS คลาดเคลื่อนไม่เกิน 50 ม."),
  ).toBeTruthy();
});
