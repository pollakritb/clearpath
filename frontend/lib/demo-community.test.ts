import { describe, expect, it } from "vitest";

import {
  buildDemoCommunityReports,
  DEMO_COMMUNITY_CENTER,
} from "./demo-community";

describe("community demo fixtures", () => {
  it("builds deterministic, fresh individual reports near Nakhon Pathom", () => {
    const now = Date.parse("2026-09-03T12:00:00Z");
    const first = buildDemoCommunityReports(now);
    const second = buildDemoCommunityReports(now);

    expect(first).toEqual(second);
    expect(first).toHaveLength(12);
    expect(first.every((report) => report.source_type === "individual")).toBe(
      true,
    );
    expect(first.every((report) => report.status === "approved")).toBe(true);
    expect(
      first.every(
        (report) =>
          Math.abs(report.lat - DEMO_COMMUNITY_CENTER.lat) < 0.08 &&
          Math.abs(report.lon - DEMO_COMMUNITY_CENTER.lon) < 0.08,
      ),
    ).toBe(true);
    expect(first.every((report) => report.policy_version === "demo-v1")).toBe(
      true,
    );
  });
});
