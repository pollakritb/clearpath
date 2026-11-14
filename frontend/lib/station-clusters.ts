import { haversineKm } from "./distance";
import type { Station } from "@/frontend/types";

export interface StationCluster<T = Station> {
  id: string;
  lat: number;
  lon: number;
  stations: T[];
}

// Match Leaflet's Web Mercator scale: degree grids can leave adjacent groups
// overlapping at cell boundaries, especially in a narrow mobile viewport.
function project(station: Pick<Station, "lat" | "lon">, zoom: number) {
  const scale = 256 * 2 ** zoom;
  const latitude = Math.max(-85.0511, Math.min(85.0511, station.lat));
  const sine = Math.sin((latitude * Math.PI) / 180);
  return {
    x: ((station.lon + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI)) * scale,
  };
}

export function clusterMapPoints<T extends Pick<Station, "id" | "lat" | "lon">>(
  stations: T[],
  zoom: number,
): StationCluster<T>[] {
  if (zoom >= 9)
    return stations.map((station) => ({
      id: `station:${station.id}`,
      lat: station.lat,
      lon: station.lon,
      stations: [station],
    }));
  const groups = [...stations]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((station) => ({
      ...project(station, zoom),
      stations: [station],
    }));
  // Limit geographic diameter as well as visual distance. Otherwise repeated
  // merges can collapse several distant provinces into one misleading group.
  const maxDiameterKm = 400 / 2 ** Math.max(0, zoom - 5);
  for (let merged = true; merged;) {
    merged = false;
    outer: for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const a = groups[i],
          b = groups[j];
        if (Math.hypot(a.x - b.x, a.y - b.y) >= 62) continue;
        if (
          a.stations.some((left) =>
            b.stations.some(
              (right) =>
                haversineKm(left.lat, left.lon, right.lat, right.lon) >
                maxDiameterKm,
            ),
          )
        )
          continue;
        const count = a.stations.length + b.stations.length;
        a.x = (a.x * a.stations.length + b.x * b.stations.length) / count;
        a.y = (a.y * a.stations.length + b.y * b.stations.length) / count;
        a.stations.push(...b.stations);
        groups.splice(j, 1);
        merged = true;
        break outer;
      }
    }
  }
  return groups.map((group) => ({
    id: `cluster:${zoom}:${group.stations.map((s) => s.id).join(":")}`,
    lat:
      group.stations.reduce((sum, s) => sum + s.lat, 0) / group.stations.length,
    lon:
      group.stations.reduce((sum, s) => sum + s.lon, 0) / group.stations.length,
    stations: group.stations,
  }));
}

export const clusterStations = clusterMapPoints;
