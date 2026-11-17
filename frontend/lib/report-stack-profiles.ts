import type { CommunityReport, CommunityReportStack } from "@/frontend/types";

/** Deduplicate people by server membership, never by display name or photo. */
export function stackReporterGroups(
  stack: CommunityReportStack,
  reports: CommunityReport[],
) {
  const memberships = new Map(
    (stack.reporter_groups ?? []).flatMap((ids, index) =>
      ids.map((id) => [id, `stack:${index}`] as const),
    ),
  );
  const included = new Set(stack.report_ids);
  const groups = new Map<string, CommunityReport[]>();
  const uniqueReports = new Map(
    reports
      .filter((report) => included.has(report.id))
      .map((report) => [report.id, report]),
  );
  for (const report of [...uniqueReports.values()].sort(
    (a, b) => Date.parse(b.captured_at) - Date.parse(a.captured_at),
  )) {
    const key =
      memberships.get(report.id) ??
      (stack.reporter_count === 1
        ? "single-reporter"
        : report.member_id || report.user_id || report.id);
    const group = groups.get(key) ?? [];
    group.push(report);
    groups.set(key, group);
  }
  return [...groups.values()].map((reports) => ({
    reports,
    // A private report never supplies a public photo, name or Trust display.
    profile:
      reports.find((report) => report.show_reporter_profile) ?? reports[0],
  }));
}
