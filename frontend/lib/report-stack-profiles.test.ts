import { expect, it } from "vitest";
import { stackReporterGroups } from "./report-stack-profiles";
import type { CommunityReport, CommunityReportStack } from "@/frontend/types";
const reports = [
  {
    id: "a",
    user_id: "per-report-a",
    display_name: "Same name",
    captured_at: "2026-11-06T10:00:00Z",
  },
  {
    id: "b",
    user_id: "per-report-b",
    display_name: "Same name",
    captured_at: "2026-11-06T11:00:00Z",
  },
  {
    id: "c",
    user_id: "other-person",
    display_name: "Same name",
    captured_at: "2026-11-06T12:00:00Z",
  },
] as CommunityReport[];
const stack = {
  report_ids: ["a", "b", "c"],
  reporter_count: 2,
  reporter_groups: [["a", "b"], ["c"]],
} as CommunityReportStack;
it("uses stack membership to deduplicate anonymous reports without merging equal names", () => {
  const groups = stackReporterGroups(stack, [...reports, reports[0]]);
  expect(groups.map((g) => g.reports.map((r) => r.id))).toEqual([
    ["c"],
    ["b", "a"],
  ]);
});
it("keeps a single person as one profile even with older API responses", () => {
  const groups = stackReporterGroups(
    { ...stack, reporter_groups: [], reporter_count: 1 },
    reports,
  );
  expect(groups).toHaveLength(1);
  expect(groups[0].reports).toHaveLength(3);
});
it("falls back to stable public member IDs rather than inferring from names or avatars", () => {
  const groups = stackReporterGroups(
    { ...stack, reporter_groups: [] },
    reports.map((r, i) => ({ ...r, member_id: i < 2 ? "MBR-1" : "MBR-2" })),
  );
  expect(groups).toHaveLength(2);
});
it("ignores reports outside the stack and selects public profile metadata only from opted-in reports", () => {
  const groups = stackReporterGroups(
    { ...stack, report_ids: ["a", "b"], reporter_count: 1 },
    [{ ...reports[0], show_reporter_profile: true }, reports[1], reports[2]],
  );
  expect(groups[0].reports.map((r) => r.id)).toEqual(["b", "a"]);
  expect(groups[0].profile.id).toBe("a");
});
