import { describe, expect, it } from "vitest";

import type { CommunityReport, Station } from "@/frontend/types";
import { assessPlaceAir, PLACE_RADIUS_KM } from "./place-air";

const baseStation: Station = {
  id: "official-1",
  name_th: "สถานีหนึ่ง",
  name_en: null,
  lat: 13.8,
  lon: 100.1,
  province: "นครปฐม",
  pm25: 20,
  aqi: null,
  color: null,
  level: null,
  recorded_at: "2026-10-05T10:00:00Z",
  data_status: "fresh",
  age_minutes: 10,
  eligible_for_surface: true,
  in_service_area: true,
  quality_flags: [],
};

const report = {
  id: "report-1",
  lat: 13.8,
  lon: 100.1,
  pm25: 45,
  status: "approved",
} as CommunityReport;

describe("place air assessment", () => {
  it("uses a 3 km search radius", () => {
    expect(PLACE_RADIUS_KM).toBe(3);
  });

  it("uses a fresh official station within 3 km and keeps reports supplementary", () => {
    const result = assessPlaceAir(
      13.8,
      100.1,
      [baseStation],
      [report],
      new Date("2026-10-05T10:10:00Z"),
    );
    expect(result.value).toBe(20);
    expect(result.method).toBe("idw");
    expect(result.stations).toHaveLength(1);
    expect(result.reports).toHaveLength(1);
  });

  it("never fabricates a value when only community or stale stations exist", () => {
    const stale = { ...baseStation, data_status: "expired" as const };
    const result = assessPlaceAir(
      13.8,
      100.1,
      [stale],
      [report],
      new Date("2026-10-05T10:10:00Z"),
    );
    expect(result.value).toBeNull();
    expect(result.stations[0].usable).toBe(false);
  });

  it("excludes outside pins, including a station just beyond the radius", () => {
    const outside = {
      ...baseStation,
      lat: 13.8 + (PLACE_RADIUS_KM + 0.1) / 111,
    };
    const result = assessPlaceAir(
      13.8,
      100.1,
      [outside],
      [{ ...report, lat: 15 }],
      new Date("2026-10-05T10:10:00Z"),
    );
    expect(result.value).toBeNull();
    expect(result.stations).toHaveLength(0);
    expect(result.reports).toHaveLength(0);
    expect(result.nearestStation?.distanceKm).toBeGreaterThan(PLACE_RADIUS_KM);
  });

  it("weights nearby stations by inverse-square haversine distance", () => {
    const second = { ...baseStation, id: "official-2", lon: 100.12, pm25: 40 };
    const result = assessPlaceAir(
      13.8,
      100.105,
      [baseStation, second],
      [report],
      new Date("2026-10-05T10:10:00Z"),
    );
    expect(result.method).toBe("idw");
    expect(result.value).toBeCloseTo(22, 3);
    expect(result.contributors[0].weight).toBeCloseTo(0.9, 4);
    expect(result.contributors[1].weight).toBeCloseTo(0.1, 4);
  });

  it("uses the exact station value without division by zero", () => {
    const result = assessPlaceAir(
      13.8,
      100.1,
      [baseStation, { ...baseStation, id: "other", lat: 13.81, pm25: 80 }],
      [],
      new Date("2026-10-05T10:10:00Z"),
    );
    expect(result.value).toBe(20);
    expect(result.contributors).toEqual([
      { stationId: baseStation.id, distanceKm: 0, pm25: 20, weight: 1 },
    ]);
  });

  it("excludes stale readings from the weighted estimate", () => {
    const result = assessPlaceAir(
      13.8,
      100.105,
      [
        baseStation,
        {
          ...baseStation,
          id: "stale",
          lon: 100.106,
          pm25: 500,
          data_status: "expired",
        },
      ],
      [],
      new Date("2026-10-05T10:10:00Z"),
    );
    expect(result.value).toBe(20);
    expect(result.contributors).toHaveLength(1);
  });
});
