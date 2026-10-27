import { describe, expect, it } from "vitest";

import type { CommunityReport, Station } from "@/frontend/types";

import { nearestHeatmapPoint } from "./nearest-surface";

const station = (id: string, lat: number, pm25: number | null): Station => ({
  id,
  name_th: id,
  name_en: null,
  lat,
  lon: 100.1,
  province: null,
  pm25,
  aqi: null,
  color: null,
  level: null,
  recorded_at: null,
  data_status: "fresh",
  age_minutes: null,
  eligible_for_surface: true,
  in_service_area: true,
  quality_flags: [],
});

describe("nearestHeatmapPoint", () => {
  const location = { lat: 13.8, lon: 100.1 };

  it("selects the closest public report even if it is not eligible for gap fill", () => {
    const official = station("official", 13.9, 18);
    const community = {
      id: "community",
      lat: 13.81,
      lon: 100.1,
      pm25: 35,
      eligible_for_gap_fill: false,
    } as CommunityReport;
    expect(nearestHeatmapPoint(location, [official], [community])).toEqual({
      id: "community",
      lat: community.lat,
      lon: community.lon,
      pm25: 35,
      source: "community",
    });
  });

  it("does not filter out delayed or surface-ineligible official stations", () => {
    expect(
      nearestHeatmapPoint(
        location,
        [
          {
            ...station("closest", 13.801, 99),
            eligible_for_surface: false,
            data_status: "expired",
          },
          station("farther", 13.82, 12),
        ],
        [],
      )?.id,
    ).toBe("closest");
  });

  it("still chooses the closest point when its PM2.5 reading is missing", () => {
    expect(
      nearestHeatmapPoint(
        location,
        [station("closest", 13.801, null), station("farther", 13.82, 12)],
        [],
      ),
    ).toMatchObject({ id: "closest", pm25: null });
  });

  it("selects a low-trust old report with no distance limit", () => {
    const report = {
      id: "old-report",
      lat: 17,
      lon: 100.1,
      pm25: 42,
      trust_score: 0,
      captured_at: "2020-01-01T00:00:00Z",
      eligible_for_gap_fill: false,
    } as unknown as CommunityReport;
    expect(
      nearestHeatmapPoint(location, [station("farther", 18, 10)], [report]),
    ).toMatchObject({ id: "old-report", source: "community" });
  });

  it("selects a closer station even when a community report is available", () => {
    const report = {
      id: "report",
      lat: 13.9,
      lon: 100.1,
      pm25: 80,
    } as CommunityReport;
    expect(
      nearestHeatmapPoint(location, [station("closest", 13.801, 10)], [report]),
    ).toMatchObject({ id: "closest", source: "station" });
  });

  it("requires a GPS location", () => {
    expect(
      nearestHeatmapPoint(null, [station("official", 13.8, 18)], []),
    ).toBeNull();
  });
});
