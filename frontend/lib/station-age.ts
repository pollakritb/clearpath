import type { Station } from "@/frontend/types";

/** Age cached readings without promoting a server-declared stale/invalid value. */
export function ageStation(station: Station, now: number): Station {
  const measuredAt = Date.parse(station.recorded_at ?? "");
  const elapsed = (now - measuredAt) / 60_000;
  const age =
    Number.isFinite(elapsed) && elapsed >= -5 ? Math.max(0, elapsed) : null;
  const clockStatus =
    age == null || age > 90 ? "expired" : age > 60 ? "delayed" : "fresh";
  const order = { fresh: 0, delayed: 1, expired: 2 };
  const data_status =
    order[station.data_status] > order[clockStatus]
      ? station.data_status
      : clockStatus;
  return {
    ...station,
    data_status,
    age_minutes: age == null ? null : Math.round(age * 10) / 10,
    eligible_for_surface:
      station.eligible_for_surface && data_status !== "expired",
  };
}
