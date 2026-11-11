import { expect, it } from "vitest";
import type { Station } from "@/frontend/types";
import { currentStationValue, stationMarkerDisplay } from "./station-display";
const station = {
  data_status: "fresh",
  eligible_for_surface: true,
  age_minutes: 60,
  pm25: 20,
} as Station;
it("does not colour prior or invalid readings as current air quality", () => {
  expect(currentStationValue(station)).toBe(20);
  for (const patch of [
    { data_status: "delayed" },
    { data_status: "expired" },
    { age_minutes: 61 },
    { age_minutes: null },
    { pm25: NaN },
    { eligible_for_surface: false },
  ]) {
    expect(currentStationValue({ ...station, ...patch } as Station)).toBeNull();
  }
});

it.each([61, 90, 91, 120])(
  "retains a labelled previous marker at %s minutes without making it current",
  (age) => {
    const previous = {
      ...station,
      data_status: age > 90 ? "expired" : "delayed",
      age_minutes: age,
      eligible_for_surface: age <= 90,
      recorded_at: "2026-11-11T09:00:00Z",
    } as Station;
    expect(stationMarkerDisplay(previous)).toEqual({
      value: 20,
      previous: true,
    });
    expect(currentStationValue(previous)).toBeNull();
  },
);

it.each([
  { age_minutes: 120.1 },
  { age_minutes: null },
  { age_minutes: NaN },
  { recorded_at: null },
  { pm25: NaN },
  { pm25: -1 },
])("does not colour invalid or older marker context: %o", (patch) => {
  expect(
    stationMarkerDisplay({
      ...station,
      age_minutes: 100,
      data_status: "expired",
      recorded_at: "2026-11-11T09:00:00Z",
      ...patch,
    } as Station),
  ).toEqual({ value: null, previous: false });
});
