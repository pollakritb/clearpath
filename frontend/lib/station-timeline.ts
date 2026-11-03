export type StationTime =
  | { kind: "current" }
  | { kind: "history"; hours: number }
  | { kind: "forecast"; at: string };
export type StationTimeMode = "history" | "forecast";

/** Each separate slider starts at now: history moves left, forecast moves right. */
export function stationTimeAt(
  position: number,
  futureTimes: string[],
  mode: StationTimeMode,
): StationTime {
  if (mode === "history")
    return position >= 1
      ? { kind: "current" }
      : {
          kind: "history",
          hours: Math.max(1, Math.min(24, Math.round((1 - position) * 24))),
        };
  if (!futureTimes.length) return { kind: "current" };
  const index = Math.min(
    futureTimes.length - 1,
    Math.max(0, Math.ceil(position * (futureTimes.length - 1) - 1e-9)),
  );
  return { kind: "forecast", at: futureTimes[index] };
}
export function stationTimePosition(
  time: StationTime,
  futureTimes: string[],
  mode: StationTimeMode,
): number {
  if (mode === "history")
    return time.kind === "history" ? 1 - time.hours / 24 : 1;
  const index = time.kind === "forecast" ? futureTimes.indexOf(time.at) : 0;
  return futureTimes.length > 1
    ? Math.max(0, index) / (futureTimes.length - 1)
    : 0;
}
