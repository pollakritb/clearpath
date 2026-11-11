import { expect, it } from "vitest";
import { assessPlaceAir } from "./place-air";
import { previousPlaceReading } from "./previous-place-reading";
import type { Station } from "@/frontend/types";
const now = Date.parse("2026-11-11T10:00:00Z");
const station = {
  id: "old",
  name_th: "สถานีเดิม",
  lat: 13.7,
  lon: 100.5,
  pm25: 20,
  recorded_at: new Date(now - 67 * 60000).toISOString(),
  data_status: "delayed",
  eligible_for_surface: true,
  in_service_area: true,
} as Station;
it("shows a source reference while the current IDW remains unavailable", () => {
  const air = assessPlaceAir(13.7, 100.5, [station], [], new Date(now));
  expect(previousPlaceReading(air)?.value).toBe(20);
  expect(air.value).toBeNull();
  expect(air.contributors).toEqual([]);
});
it("skips invalid, missing and future source times", () => {
  for (const recorded_at of [
    null,
    "bad",
    new Date(now + 60000).toISOString(),
  ]) {
    const air = assessPlaceAir(
      13.7,
      100.5,
      [{ ...station, recorded_at }],
      [],
      new Date(now),
    );
    expect(previousPlaceReading(air)).toBeNull();
  }
});
