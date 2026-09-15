import { describe, expect, it } from "vitest";

import { estimateLocalAir, type LocalAirPoint } from "./local-air";

const points: LocalAirPoint[] = [
  {
    lat: 13.75,
    lon: 100.5,
    pm25: 20,
    source: "official",
    name: "สถานี ก",
  },
  {
    lat: 13.8,
    lon: 100.55,
    pm25: 40,
    source: "community",
    name: "จุดชุมชน",
  },
];

describe("estimateLocalAir", () => {
  it("interpolates nearby verified points and explains the sources", () => {
    const result = estimateLocalAir(13.775, 100.525, points);

    expect(result?.basis).toBe("idw");
    expect(result?.pm25).toBeGreaterThan(20);
    expect(result?.pm25).toBeLessThan(40);
    expect(result?.officialCount).toBe(1);
    expect(result?.communityCount).toBe(1);
  });

  it("uses a single nearby station as a clearly labelled reference", () => {
    const result = estimateLocalAir(13.75, 100.5, [points[0]]);

    expect(result).toMatchObject({
      pm25: 20,
      basis: "nearest",
      contributorCount: 1,
      nearestName: "สถานี ก",
    });
  });

  it("does not extrapolate when every point is farther than 30 km", () => {
    expect(estimateLocalAir(18.8, 98.9, points)).toBeNull();
  });
});
