import { describe, expect, it } from "vitest";

import { haversineKm, idwValue } from "./idw";

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

describe("idwValue", () => {
  const stations = [
    { lat: 13.8, lon: 100.0, pm25: 20 },
    { lat: 13.9, lon: 100.1, pm25: 40 },
  ];

  it("returns null without stations", () => {
    expect(idwValue(13.85, 100.05, [])).toBeNull();
  });

  it("returns an exact station value at the station coordinate", () => {
    expect(idwValue(13.8, 100.0, stations)).toBe(20);
  });

  it("interpolates between nearby stations", () => {
    const value = idwValue(13.85, 100.05, stations);
    expect(value).not.toBeNull();
    expect(value as number).toBeGreaterThan(20);
    expect(value as number).toBeLessThan(40);
  });
});
