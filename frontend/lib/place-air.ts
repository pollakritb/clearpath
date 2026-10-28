import type { CommunityReport, Station } from "@/frontend/types";

import { haversineKm } from "./distance";

export const PLACE_RADIUS_KM = 3;

export interface NearbyStation {
  station: Station;
  distanceKm: number;
  ageMinutes: number | null;
  usable: boolean;
}

export interface NearbyReport {
  report: CommunityReport;
  distanceKm: number;
  ageMinutes: number | null;
}

export interface PlaceAir {
  value: number | null;
  method: "idw" | "unavailable";
  contributors: {
    stationId: string;
    distanceKm: number;
    pm25: number;
    weight: number;
  }[];
  stations: NearbyStation[];
  reports: NearbyReport[];
  nearestStation: NearbyStation | null;
}

export function assessPlaceAir(
  lat: number,
  lon: number,
  stations: Station[],
  reports: CommunityReport[],
  now = new Date(),
): PlaceAir {
  const allStations = stations
    .filter((station) => station.in_service_area)
    .map((station) => {
      const distanceKm = haversineKm(lat, lon, station.lat, station.lon);
      const measuredAt = station.recorded_at
        ? Date.parse(station.recorded_at)
        : NaN;
      const ageMinutes = (now.getTime() - measuredAt) / 60_000;
      return {
        station,
        distanceKm,
        ageMinutes: Number.isFinite(ageMinutes) ? ageMinutes : null,
        usable:
          distanceKm <= PLACE_RADIUS_KM &&
          station.data_status === "fresh" &&
          station.eligible_for_surface &&
          Number.isFinite(ageMinutes) &&
          ageMinutes >= -5 &&
          ageMinutes <= 60 &&
          station.pm25 != null &&
          Number.isFinite(station.pm25),
      };
    })
    .sort((a, b) => a.distanceKm - b.distanceKm);
  const nearby = allStations.filter(
    (item) => item.distanceKm <= PLACE_RADIUS_KM,
  );
  const usable = nearby.filter((item) => item.usable);
  // Haversine distance in km, inverse-square weights (p=2).
  // An exact match takes the observed value instead of dividing by zero.
  const exact = usable.find((item) => item.distanceKm < 1e-9);
  const selected = exact ? [exact] : usable;
  const nearestDistance = selected[0]?.distanceKm ?? 0;
  // Scaling every weight by the same distance² preserves IDW and avoids overflow.
  const weights = selected.map((item) =>
    exact ? 1 : (nearestDistance / item.distanceKm) ** 2,
  );
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  const contributors = selected.map((item, index) => ({
    stationId: item.station.id,
    distanceKm: item.distanceKm,
    pm25: item.station.pm25!,
    weight: weights[index] / weightSum,
  }));
  const nearbyReports = reports
    .filter(
      (report) =>
        report.status === "approved" &&
        report.pm25 != null &&
        Number.isFinite(report.pm25),
    )
    .map((report) => {
      const capturedAt = Date.parse(report.captured_at);
      const ageMinutes = (now.getTime() - capturedAt) / 60_000;
      return {
        report,
        distanceKm: haversineKm(lat, lon, report.lat, report.lon),
        ageMinutes: Number.isFinite(ageMinutes)
          ? ageMinutes
          : report.age_minutes,
      };
    })
    .filter((item) => item.distanceKm <= PLACE_RADIUS_KM)
    .sort((a, b) => a.distanceKm - b.distanceKm);

  const value = contributors.length
    ? contributors.reduce((sum, item) => sum + item.weight * item.pm25, 0)
    : null;

  return {
    value,
    method: value == null ? "unavailable" : "idw",
    contributors,
    stations: nearby,
    reports: nearbyReports,
    nearestStation: allStations[0] ?? null,
  };
}
