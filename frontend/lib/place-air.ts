import type { CommunityReport, Station } from "@/frontend/types";

import { haversineKm, idwValue } from "./idw";

export const PLACE_RADIUS_KM = 5;

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
  method: "nearest_station" | "idw" | "unavailable";
  stations: NearbyStation[];
  reports: NearbyReport[];
  nearestStation: NearbyStation | null;
  usedStationCount: number;
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
  const usable = nearby.filter((item) => item.usable).slice(0, 5);
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

  const value =
    usable.length === 1
      ? usable[0].station.pm25
      : usable.length > 1
        ? idwValue(
            lat,
            lon,
            usable.map(({ station }) => ({
              lat: station.lat,
              lon: station.lon,
              pm25: station.pm25 as number,
            })),
          )
        : null;

  return {
    value,
    method:
      value == null
        ? "unavailable"
        : usable.length === 1
          ? "nearest_station"
          : "idw",
    stations: nearby,
    reports: nearbyReports,
    nearestStation: allStations[0] ?? null,
    usedStationCount: usable.length,
  };
}
