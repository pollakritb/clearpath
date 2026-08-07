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
});
