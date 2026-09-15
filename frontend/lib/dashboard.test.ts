import { describe, expect, it } from "vitest";

import type {
  CommunityMapPoint,
  CommunityReport,
  ForecastSurfaceResponse,
  Station,
} from "@/frontend/types";

import {
  buildCurrentSurfaceStations,
  buildForecastSurfaceStations,
  countCommunitySources,
} from "./dashboard";

const station = (overrides: Partial<Station> = {}): Station => ({
  id: "station-1",
  name_th: "สถานีทดสอบ",
  name_en: "Test station",
  lat: 13.8,
  lon: 100.1,
  province: "นครปฐม",
  pm25: 20,
  aqi: null,
  color: null,
  level: null,
  recorded_at: null,
  data_status: "fresh",
  age_minutes: 10,
  eligible_for_surface: true,
  in_service_area: true,
  quality_flags: [],
  ...overrides,
});

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

  it("adds verified community gap-fill points to eligible stations", () => {
    const mapPoint: CommunityMapPoint = {
      id: "community-1",
      lat: 13.7,
      lon: 100.2,
      pm25: 18,
      report_count: 2,
      reporter_count: 2,
      source: "community",
      averaging_period: "instant",
      report_ids: ["report-1", "report-2"],
    };

    const result = buildCurrentSurfaceStations(
      [station(), station({ id: "excluded", eligible_for_surface: false })],
      [mapPoint],
    );

    expect(result.map(({ id }) => id)).toEqual(["station-1", "community-1"]);
    expect(result[1]).toMatchObject({
      pm25: 18,
      eligible_for_surface: true,
      data_status: "fresh",
    });
  });

  it("drops unavailable forecast cells and marks sparse cells as delayed", () => {
    const surface: ForecastSurfaceResponse = {
      generated_at: "2026-09-15T00:00:00Z",
      horizon_hours: 12,
      method: "external_provider",
      source_policy: "official_stations_only",
      station_count: 1,
      grid_size: 2,
      bounds: {},
      coverage_counts: { sparse: 1, unavailable: 1 },
      warnings: [],
      cells: [
        {
          lat: 13.7,
          lon: 100.2,
          pm25: null,
          lower: null,
          upper: null,
          coverage: "unavailable",
          nearby_station_count: 0,
          nearest_station_km: null,
        },
        {
          lat: 13.8,
          lon: 100.3,
          pm25: 22,
          lower: 17,
          upper: 28,
          coverage: "sparse",
          nearby_station_count: 1,
          nearest_station_km: 10,
        },
      ],
    };

    expect(buildForecastSurfaceStations(surface, 12)).toEqual([
      expect.objectContaining({
        id: "forecast-12-1",
        pm25: 22,
        data_status: "delayed",
      }),
    ]);
  });
});
