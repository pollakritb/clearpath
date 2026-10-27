import { describe, expect, it } from "vitest";

import type { CommunityReport } from "@/frontend/types";

import { countCommunitySources } from "./dashboard";

describe("dashboard map models", () => {
  it("counts community sensors separately from individual reports", () => {
    const reports: Pick<CommunityReport, "source_type">[] = [
      { source_type: "community_sensor" },
      { source_type: "individual" },
      { source_type: "individual" },
    ];

    expect(countCommunitySources(reports)).toEqual({
      sensor: 1,
      individual: 2,
    });
  });
});
