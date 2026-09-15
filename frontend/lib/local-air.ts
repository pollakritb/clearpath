import { haversineKm, idwValue } from "./idw";

export interface LocalAirPoint {
  lat: number;
  lon: number;
  pm25: number;
  source: "official" | "community";
  name: string;
}

export interface LocalAirEstimate {
  pm25: number;
  basis: "idw" | "nearest";
  nearestDistanceKm: number;
  nearestName: string;
  contributorCount: number;
  officialCount: number;
  communityCount: number;
}

const MAX_LOCAL_DISTANCE_KM = 30;
const MAX_CONTRIBUTORS = 5;

export function estimateLocalAir(
  lat: number,
  lon: number,
  points: LocalAirPoint[],
): LocalAirEstimate | null {
  const nearby = points
    .filter(
      (point) =>
        Number.isFinite(point.pm25) &&
        point.pm25 >= 0 &&
        Number.isFinite(point.lat) &&
        Number.isFinite(point.lon),
    )
    .map((point) => ({
      ...point,
      distanceKm: haversineKm(lat, lon, point.lat, point.lon),
    }))
    .filter((point) => point.distanceKm <= MAX_LOCAL_DISTANCE_KM)
    .sort((left, right) => left.distanceKm - right.distanceKm)
    .slice(0, MAX_CONTRIBUTORS);

  if (!nearby.length) return null;

  const nearest = nearby[0];
  const interpolated =
    nearby.length === 1
      ? nearest.pm25
      : idwValue(lat, lon, nearby, 2, MAX_CONTRIBUTORS);
  if (interpolated == null) return null;

  return {
    pm25: Math.round(interpolated * 10) / 10,
    basis: nearby.length === 1 ? "nearest" : "idw",
    nearestDistanceKm: Math.round(nearest.distanceKm * 10) / 10,
    nearestName: nearest.name,
    contributorCount: nearby.length,
    officialCount: nearby.filter((point) => point.source === "official").length,
    communityCount: nearby.filter((point) => point.source === "community")
      .length,
  };
}
