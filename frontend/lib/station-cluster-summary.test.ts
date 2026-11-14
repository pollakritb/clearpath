import { expect, it } from "vitest";
import type { Station } from "@/frontend/types";
import { stationClusterSummary } from "./station-cluster-summary";
const station = (pm25: number | null, age = 10, eligible = true) =>
  ({
    pm25,
    age_minutes: age,
    eligible_for_surface: eligible,
    data_status: age <= 60 ? "fresh" : "expired",
  }) as Station;
it("shows the latest numeric observation from all stations without promoting stale readings", () => {
  expect(
    stationClusterSummary([
      station(12),
      station(35),
      station(200, 90),
      station(999, 10, false),
    ]),
  ).toEqual({
    count: 4,
    value: 311.5,
    expired: true,
    freshCount: 2,
    previous: true,
    valueCount: 4,
  });
});
it("does not fabricate a current value when every station is stale", () => {
  expect(
    stationClusterSummary([station(20, 61), station(null), station(NaN)]),
  ).toMatchObject({ value: 20, freshCount: 0, previous: true });
});
it("preserves zero and avoids a redundant range for identical observations", () => {
  expect(stationClusterSummary([station(0), station(0)])).toMatchObject({
    value: 0,
    freshCount: 2,
  });
});

it("does not invent measurements for stations without numeric observations", () => {
  expect(
    stationClusterSummary([station(null), station(NaN), station(-1)]),
  ).toMatchObject({ value: null, freshCount: 0 });
});

it("keeps precision for AQI classification until rendering rounds the value", () => {
  expect(
    stationClusterSummary([station(15.1), station(15.7)]).value,
  ).toBeCloseTo(15.4);
});
