import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildDemoCommunityReports,
  DEMO_COMMUNITY_CENTER,
  isCommunityDemoMode,
} from "./demo-community";

describe("community demo fixtures", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("builds deterministic, fresh individual reports near Nakhon Pathom", () => {
    const now = Date.parse("2026-09-03T12:00:00Z");
    const first = buildDemoCommunityReports(now);
    const second = buildDemoCommunityReports(now);

    expect(first).toEqual(second);
    expect(first).toHaveLength(12);
    expect(first[0].image_url).toContain("data:image/svg+xml,");
    expect(first.every((report) => report.source_type === "individual")).toBe(
      true,
    );
    expect(first.every((report) => report.status === "approved")).toBe(true);
    expect(
      first.every((report) =>
        decodeURIComponent(report.image_url ?? "").includes(
          `>${report.pm25}</text>`,
        ),
      ),
    ).toBe(true);
    expect(
      first.every((report) => report.verification_method === "automatic"),
    ).toBe(true);
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

  it("enables demo data only for the explicit community query", () => {
    expect(isCommunityDemoMode()).toBe(false);

    vi.stubGlobal("window", { location: { search: "?demo=community" } });
    expect(isCommunityDemoMode()).toBe(true);

    vi.stubGlobal("window", { location: { search: "?demo=other" } });
    expect(isCommunityDemoMode()).toBe(false);
  });

  it("never enables mock reports on a normal Production build", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_LOCAL_DEMO_MODE", "false");
    vi.stubGlobal("window", { location: { search: "?demo=community" } });
    expect(isCommunityDemoMode()).toBe(false);
  });
});
