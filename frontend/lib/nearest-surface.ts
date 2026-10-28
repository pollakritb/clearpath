import type { CommunityReport, Station } from "@/frontend/types";

import { haversineKm } from "./distance";

export interface HeatmapPoint {
  id: string;
  lat: number;
  lon: number;
  pm25: number | null;
  source: "station" | "community";
}

export function nearestHeatmapPoint(
  location: { lat: number; lon: number } | null,
  stations: Station[],
  reports: CommunityReport[],
  excludedUserId: string | null = null,
): HeatmapPoint | null {
  if (!location) return null;

  let nearest: HeatmapPoint | null = null;
  let nearestKm = Infinity;
  const consider = (
    point: Pick<HeatmapPoint, "id" | "lat" | "lon" | "pm25">,
    source: HeatmapPoint["source"],
  ) => {
    const distanceKm = haversineKm(
      location.lat,
      location.lon,
      point.lat,
      point.lon,
    );
    if (distanceKm < nearestKm) {
      nearest = {
        id: point.id,
        lat: point.lat,
        lon: point.lon,
        pm25: point.pm25,
        source,
      };
      nearestKm = distanceKm;
    }
  };

  for (const station of stations) consider(station, "station");
  for (const report of reports) {
    if (excludedUserId && report.user_id === excludedUserId) continue;
    consider(report, "community");
  }
  return nearest;
}
