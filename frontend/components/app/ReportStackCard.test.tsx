import {
  cleanup,
  fireEvent,
  render as renderUI,
  screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import ReportStackCard from "./ReportStackCard";
import type { CommunityReport, CommunityReportStack } from "@/frontend/types";

const render = (...args: Parameters<typeof renderUI>) => {
  const result = renderUI(...args);
  fireEvent.keyDown(
    screen.getByRole("button", { name: "เลื่อนแผงข้อมูลขึ้นลง" }),
    { key: "End" },
  );
  return result;
};
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
  contributing_count: 2,
  contributing_report_ids: ["a", "c"],
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
it("labels the mean by independent people and keeps older readings as history", () => {
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
  expect(screen.getByText("ค่าเฉลี่ยค่าล่าสุดจาก 2 คน")).toBeTruthy();
  expect(screen.queryByText(/60 นาที/)).toBeNull();
  expect(screen.getByText(/ใช้ค่าล่าสุดคนละ 1 รายงาน/)).toBeTruthy();
  expect(screen.getAllByText("ใช้ในค่าเฉลี่ย")).toHaveLength(2);
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
    screen.getByText("ไม่มีค่าล่าสุดที่ GPS คลาดเคลื่อนไม่เกิน 50 ม."),
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
  expect(screen.getByText(/^ค่าล่าสุด ·/)).toBeTruthy();
});
it("shows one profile per person while keeping all individual readings accessible", () => {
  const select = vi.fn();
  render(
    <ReportStackCard
      stack={stack}
      reports={reports}
      onSelectReport={select}
      onClose={vi.fn()}
    />,
  );
  expect(screen.getAllByText("Alice")).toHaveLength(1);
  expect(screen.getAllByText("Bob")).toHaveLength(1);
  expect(
    screen.getAllByRole("button", { name: /ดูรายงานของ Alice/ }),
  ).toHaveLength(2);
  fireEvent.click(
    screen.getAllByRole("button", { name: /ดูรายงานของ Alice/ })[1],
  );
  expect(select).toHaveBeenCalledWith(reports[1]);
});
it("combines per-report anonymous IDs using the server's stack-only grouping", () => {
  render(
    <ReportStackCard
      stack={{
        ...stack,
        reporter_count: 1,
        reporter_groups: [["a", "b", "c"]],
      }}
      reports={reports.map((r, i) => ({
        ...r,
        user_id: `token-${i}`,
        display_name: "Reporter",
      }))}
      onSelectReport={vi.fn()}
      onClose={vi.fn()}
    />,
  );
  expect(screen.getAllByText("Reporter")).toHaveLength(1);
  expect(
    screen.getAllByRole("button", { name: /ดูรายงานของ Reporter/ }),
  ).toHaveLength(3);
});
it("shows the latest value 6 and keeps the older value 4 as history for one person", () => {
  const readings = [
    { ...reports[0], id: "new", pm25: 6, captured_at: "2026-11-06T14:33:00Z" },
    { ...reports[0], id: "old", pm25: 4, captured_at: "2026-11-06T14:32:00Z" },
  ];
  render(
    <ReportStackCard
      stack={{
        ...stack,
        report_ids: ["new", "old"],
        report_count: 2,
        reporter_count: 1,
        pm25: 6,
        value_status: "single",
        contributing_count: 1,
        contributing_report_ids: ["new"],
      }}
      reports={readings}
      onSelectReport={vi.fn()}
      onClose={vi.fn()}
    />,
  );
  expect(screen.getByText(/^ค่าล่าสุด ·/)).toBeTruthy();
  expect(screen.queryByText(/^ค่าเฉลี่ย/)).toBeNull();
  expect(screen.getAllByText("Alice")).toHaveLength(1);
  expect(screen.getByText("ค่าล่าสุด", { exact: true })).toBeTruthy();
  expect(screen.getByText("รายงานก่อนหน้า")).toBeTruthy();
  expect(screen.queryByText("ใช้ในค่าเฉลี่ย")).toBeNull();
});
