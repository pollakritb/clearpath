import type { PlaceAir } from "./place-air";

/** A single source reading for reference only; never feeds the current IDW. */
export function previousPlaceReading(air: PlaceAir) {
  const candidates = [
    ...air.stations.map(({ station, distanceKm, ageMinutes }) => ({
      id: `station:${station.id}`,
      name: station.name_th ?? station.name_en ?? station.id,
      value: station.pm25,
      at: station.recorded_at,
      distanceKm,
      ageMinutes,
    })),
    ...air.reports
      .filter(
        ({ report, exclusion }) =>
          report.status === "approved" && exclusion !== "selection_unavailable",
      )
      .map(({ report, distanceKm, ageMinutes }) => ({
        id: `report:${report.id}`,
        name: report.display_name ?? "ผู้รายงานไม่เปิดเผยตัวตน",
        value: report.pm25,
        at: report.captured_at,
        distanceKm,
        ageMinutes,
      })),
  ].filter(
    (item) =>
      item.value != null &&
      Number.isFinite(item.value) &&
      item.value >= 0 &&
      Number.isFinite(Date.parse(item.at ?? "")) &&
      item.ageMinutes != null &&
      Number.isFinite(item.ageMinutes) &&
      item.ageMinutes >= 0,
  );
  return (
    candidates.sort(
      (a, b) =>
        Date.parse(b.at!) - Date.parse(a.at!) ||
        a.distanceKm - b.distanceKm ||
        a.id.localeCompare(b.id),
    )[0] ?? null
  );
}
