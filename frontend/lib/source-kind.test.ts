import { describe, expect, it } from "vitest";

import { communitySourceKind } from "./source-kind";

describe("communitySourceKind", () => {
  it("labels only registered community stations as sensors", () => {
    expect(communitySourceKind({ source_type: "community_sensor" })).toBe(
      "sensor",
    );
  });

  it("keeps individual reports separate from calibration metadata", () => {
    expect(communitySourceKind({ source_type: "individual" })).toBe(
      "individual",
    );
  });
});
