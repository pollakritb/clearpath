import type { Station } from "@/frontend/types";
import {
  currentStationValue,
  latestStationValue,
  stationMarkerDisplay,
} from "./station-display";

/** Display-only mean of group observations. Never used for IDW or area estimates. */
export function stationClusterSummary(stations: Station[]) {
  const values = stations.flatMap((station) => {
    const value = latestStationValue(station);
    return value == null ? [] : [value];
  });
  return {
    count: stations.length,
    value: values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : null,
    expired: stations.some(
      (station) =>
        latestStationValue(station) != null &&
        stationMarkerDisplay(station).value == null,
    ),
    freshCount: stations.filter(
      (station) => currentStationValue(station) != null,
    ).length,
    previous: stations.some(
      (station) =>
        latestStationValue(station) != null &&
        currentStationValue(station) == null,
    ),
    valueCount: values.length,
  };
}
