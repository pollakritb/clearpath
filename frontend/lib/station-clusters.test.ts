import { describe, expect, it } from "vitest";

import { clusterStations } from "./station-clusters";
import type { Station } from "../types";

const station = (id: string, lat: number, lon: number): Station => ({
  id,
  name_th: id,
  name_en: null,
  lat,
  lon,
  province: null,
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
});

describe("clusterStations", () => {
  it("groups nearby stations at national zoom", () => {
    const clusters = clusterStations(
      [station("a", 13.7, 100.5), station("b", 13.8, 100.6)],
      6,
    );
    expect(clusters).toHaveLength(1);
    expect(clusters[0].stations).toHaveLength(2);
  });

  it("keeps individual stations at detail zoom", () => {
    const clusters = clusterStations(
      [station("a", 13.7, 100.5), station("b", 13.8, 100.6)],
      10,
    );
    expect(clusters).toHaveLength(2);
    expect(clusters.every((cluster) => cluster.stations.length === 1)).toBe(
      true,
    );
  });

  it.each([5, 7, 8])("uses the expected grid branch at zoom %s", (zoom) => {
    const clusters = clusterStations([station("a", 13.7, 100.5)], zoom);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].id).toContain(`cluster:${zoom}:`);
  });
});

it("merges nearby stations across the former degree-grid boundary", () => {
  const clusters = clusterStations(
    [station("a", 13.99, 100.79), station("b", 14.01, 100.81)],
    6,
  );
  expect(clusters).toHaveLength(1);
  expect(
    clusterStations(
      [station("b", 14.01, 100.81), station("a", 13.99, 100.79)],
      6,
    ),
  ).toEqual(clusters);
});

it("does not chain nearby centres into a group spanning distant provinces", () => {
  const points = Array.from({ length: 12 }, (_, i) =>
    station(String(i), 13.5 + i * 0.3, 100.5),
  );
  const groups = clusterStations(points, 6);
  for (const group of groups) {
    const latitudes = group.stations.map((s) => s.lat);
    expect(Math.max(...latitudes) - Math.min(...latitudes)).toBeLessThan(2);
  }
});
