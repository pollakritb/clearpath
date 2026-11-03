export type StationTime =
  | { kind: "current" }
  | { kind: "history"; hours: number }
  | { kind: "forecast"; at: string };

export function stationTimeAt(
  position: number,
  futureTimes: string[],
): StationTime {
  if (position < 0)
    return {
      kind: "history",
      hours: Math.max(1, Math.min(24, Math.ceil(-position * 24 - 1e-9))),
    };
  if (position > 0 && futureTimes.length) {
    const index = Math.min(
      futureTimes.length - 1,
      Math.max(0, Math.ceil(position * futureTimes.length - 1e-9) - 1),
    );
    return { kind: "forecast", at: futureTimes[index] };
  }
  return { kind: "current" };
}

export function stationTimePosition(
  time: StationTime,
  futureTimes: string[],
): number {
  if (time.kind === "history") return -time.hours / 24;
  if (time.kind === "forecast") {
    const index = futureTimes.indexOf(time.at);
    return index < 0 ? 0 : (index + 1) / futureTimes.length;
  }
  return 0;
}
