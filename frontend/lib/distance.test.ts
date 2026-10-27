import { describe, expect, it } from "vitest";

import { haversineKm } from "./distance";

describe("haversineKm", () => {
  it("returns zero for the same coordinate", () => {
    expect(haversineKm(13.82, 100.06, 13.82, 100.06)).toBeCloseTo(0, 8);
  });

  it("calculates geodesic distance instead of planar degrees", () => {
    expect(haversineKm(13.7563, 100.5018, 13.8199, 100.0622)).toBeCloseTo(
      48.2,
      0,
    );
  });
});
