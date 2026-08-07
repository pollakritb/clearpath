import type { Station } from "@/frontend/types";

export interface StationCluster {
  id: string;
  lat: number;
  lon: number;
  stations: Station[];
}

function cellSizeDegrees(zoom: number): number {
  if (zoom <= 5) return 2.4;
  if (zoom === 6) return 1.4;
  if (zoom === 7) return 0.75;
  if (zoom === 8) return 0.35;
  return 0;
}

export function clusterStations(
  stations: Station[],
  zoom: number,
): StationCluster[] {
  const cellSize = cellSizeDegrees(zoom);
  if (!cellSize) {
    return stations.map((station) => ({
      id: `station:${station.id}`,
      lat: station.lat,
      lon: station.lon,
      stations: [station],
    }));
  }

  const groups = new Map<string, Station[]>();
  for (const station of stations) {
    const row = Math.floor(station.lat / cellSize);
    const column = Math.floor(station.lon / cellSize);
    const key = `${row}:${column}`;
    groups.set(key, [...(groups.get(key) ?? []), station]);
  }

  return [...groups.entries()].map(([key, members]) => ({
    id: `cluster:${zoom}:${key}`,
    lat:
      members.reduce((total, station) => total + station.lat, 0) /
      members.length,
    lon:
      members.reduce((total, station) => total + station.lon, 0) /
      members.length,
    stations: members,
  }));
}
