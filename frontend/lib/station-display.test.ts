import { expect, it } from "vitest";
import type { Station } from "@/frontend/types";
import { currentStationValue } from "./station-display";
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
