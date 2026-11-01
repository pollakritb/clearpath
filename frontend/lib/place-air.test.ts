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
  it("uses a 2 km search radius", () => {
    expect(PLACE_RADIUS_KM).toBe(2);
  });

  it("preserves an exact station reading while an undated report stays supplementary", () => {
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

  it("never fabricates a value from undated community or stale stations", () => {
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

  it("excludes stations and reports 2.5 km away that were inside the previous 3 km radius", () => {
    const outside = {
      ...baseStation,
      lat: 13.8 + 2.5 / 111,
    };
    const result = assessPlaceAir(
      13.8,
      100.1,
      [outside],
      [{ ...report, lat: outside.lat }],
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
      {
        source: "station",
        id: baseStation.id,
        distanceKm: 0,
        pm25: 20,
        weight: 1,
      },
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

const reference = new Date("2026-10-05T10:10:00Z");
const freshReport = {
  ...report,
  captured_at: "2026-10-05T10:00:00Z",
  trust_score: 0,
  measurement_stable: false,
} as CommunityReport;

it("combines a station and fresh user report with identical distance-only weights", () => {
  const result = assessPlaceAir(
    13.8,
    100.105,
    [baseStation],
    [{ ...freshReport, lon: 100.12, pm25: 40 }],
    reference,
  );
  expect(result.value).toBeCloseTo(22, 3);
  expect(result.contributors.map((point) => point.source)).toEqual([
    "station",
    "report",
  ]);
  expect(result.contributors[0].weight).toBeCloseTo(0.9, 4);
  expect(result.contributors[1].weight).toBeCloseTo(0.1, 4);
  expect(
    result.contributors.reduce((sum, point) => sum + point.weight, 0),
  ).toBeCloseTo(1);
});
it("uses fresh community reports without a station or a Trust/stability multiplier", () => {
  const result = assessPlaceAir(
    13.8,
    100.105,
    [],
    [freshReport, { ...freshReport, id: "other", lon: 100.12, pm25: 25 }],
    reference,
  );
  expect(result.value).toBeCloseTo(43, 3);
  expect(result.method).toBe("idw");
  expect(result.contributors.every((point) => point.source === "report")).toBe(
    true,
  );
});
it("ignores stale, rejected, future, missing-time and non-finite reports", () => {
  const invalid = [
    { ...freshReport, id: "old", captured_at: "2026-10-05T07:09:59Z" },
    { ...freshReport, id: "rejected", status: "rejected" as const },
    { ...freshReport, id: "future", captured_at: "2026-10-05T10:16:00Z" },
    { ...freshReport, id: "undated", captured_at: "invalid" },
    { ...freshReport, id: "nan", pm25: NaN },
    { ...freshReport, id: "outside", lat: 15 },
  ];
  expect(assessPlaceAir(13.8, 100.1, [], invalid, reference).value).toBeNull();
});
it("uses an exact community reading without dividing by zero", () => {
  const result = assessPlaceAir(13.8, 100.1, [], [freshReport], reference);
  expect(result.value).toBe(45);
  expect(result.contributors[0]).toEqual({
    source: "report",
    id: "report-1",
    distanceKm: 0,
    pm25: 45,
    weight: 1,
  });
});

it("keeps reports for three hours while station freshness remains one hour", () => {
  const agedReport = { ...freshReport, captured_at: "2026-10-05T08:10:00Z" };
  const agedStation = { ...baseStation, recorded_at: "2026-10-05T08:10:00Z" };
  const result = assessPlaceAir(
    13.8,
    100.1,
    [agedStation],
    [agedReport],
    reference,
  );
  expect(result.value).toBe(45);
  expect(result.stations[0].usable).toBe(false);
  expect(result.reports[0].usable).toBe(true);
  expect(result.contributors.map((point) => point.source)).toEqual(["report"]);
});
it("includes a report at exactly three hours and drops it immediately after expiry", () => {
  const atLimit = { ...freshReport, captured_at: "2026-10-05T07:10:00Z" };
  expect(assessPlaceAir(13.8, 100.1, [], [atLimit], reference).value).toBe(45);
  const expired = { ...atLimit, captured_at: "2026-10-05T07:09:59Z" };
  const result = assessPlaceAir(13.8, 100.1, [], [expired], reference);
  expect(result.value).toBeNull();
  expect(result.reports[0].usable).toBe(false);
});
