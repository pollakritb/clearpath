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
