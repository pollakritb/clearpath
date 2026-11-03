import { expect, it } from "vitest";
import { stationTimeAt, stationTimePosition } from "./station-timeline";

it("starts history at the right end and reaches each prior hour moving left", () => {
  expect(stationTimeAt(1, [], "history")).toEqual({ kind: "current" });
  expect(stationTimeAt(0, [], "history")).toEqual({
    kind: "history",
    hours: 24,
  });
  for (let hours = 1; hours <= 24; hours++) {
    const time = { kind: "history" as const, hours };
    expect(
      stationTimeAt(stationTimePosition(time, [], "history"), [], "history"),
    ).toEqual(time);
  }
});
it("starts CAMS at the left end and reaches every returned forecast hour moving right", () => {
  const times = Array.from({ length: 120 }, (_, i) =>
    new Date(Date.UTC(2030, 0, 1, i)).toISOString(),
  );
  expect(stationTimeAt(0, times, "forecast")).toEqual({
    kind: "forecast",
    at: times[0],
  });
  expect(stationTimeAt(1, times, "forecast")).toEqual({
    kind: "forecast",
    at: times.at(-1),
  });
  times.forEach((at) => {
    const time = { kind: "forecast" as const, at };
    expect(
      stationTimeAt(
        stationTimePosition(time, times, "forecast"),
        times,
        "forecast",
      ),
    ).toEqual(time);
  });
});
