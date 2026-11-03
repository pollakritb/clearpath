import { expect, it } from "vitest";
import { stationTimeAt, stationTimePosition } from "./station-timeline";

it("keeps now exactly centered with Air4Thai on the left and every CAMS hour on the right", () => {
  const times = Array.from({ length: 120 }, (_, i) =>
    new Date(Date.UTC(2030, 0, 1, i + 1)).toISOString(),
  );
  expect(stationTimeAt(-1, times)).toEqual({ kind: "history", hours: 24 });
  expect(stationTimeAt(-0.001, times)).toEqual({ kind: "history", hours: 1 });
  expect(stationTimeAt(0, times)).toEqual({ kind: "current" });
  times.forEach((at) => {
    const time = { kind: "forecast" as const, at };
    expect(stationTimeAt(stationTimePosition(time, times), times)).toEqual(
      time,
    );
  });
  expect(stationTimeAt(1, times)).toEqual({
    kind: "forecast",
    at: times.at(-1),
  });
  expect(stationTimeAt(0.5, [])).toEqual({ kind: "current" });
});
