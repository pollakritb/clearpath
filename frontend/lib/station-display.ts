import type { Station } from "@/frontend/types";

/** Colours describe only observations meeting the current station policy. */
export function currentStationValue(station: Station): number | null {
  return station.data_status === "fresh" &&
    station.eligible_for_surface &&
    station.age_minutes != null &&
    station.age_minutes >= 0 &&
    station.age_minutes <= 60 &&
    station.pm25 != null &&
    Number.isFinite(station.pm25) &&
    station.pm25 >= 0
    ? station.pm25
    : null;
}

/** Display-only context: never use previous readings for current calculations. */
export function stationMarkerDisplay(station: Station): {
  value: number | null;
  previous: boolean;
} {
  const current = currentStationValue(station);
  if (current != null) return { value: current, previous: false };
  const previous =
    station.age_minutes != null &&
    Number.isFinite(station.age_minutes) &&
    station.age_minutes > 60 &&
    station.age_minutes <= 120 &&
    Number.isFinite(Date.parse(station.recorded_at ?? "")) &&
    station.pm25 != null &&
    Number.isFinite(station.pm25) &&
    station.pm25 >= 0;
  return { value: previous ? station.pm25 : null, previous };
}
