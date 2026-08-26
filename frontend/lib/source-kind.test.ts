import { describe, expect, it } from "vitest";

import { communitySourceKind } from "./source-kind";

describe("communitySourceKind", () => {
  it("labels calibrated devices as community sensors", () => {
    expect(communitySourceKind({ device_calibrated: true })).toBe("sensor");
  });

  it("labels other devices as individual reports", () => {
    expect(communitySourceKind({ device_calibrated: false })).toBe(
      "individual",
    );
  });
});
