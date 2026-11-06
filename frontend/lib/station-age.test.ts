import { expect, it } from "vitest";
import type { Station } from "@/frontend/types";
import { ageStation } from "./station-age";
const now = Date.parse("2026-11-06T00:00:00Z");
const station = {
  recorded_at: new Date(now - 60 * 60000).toISOString(),
  data_status: "fresh",
  eligible_for_surface: true,
} as Station;
it("uses the existing 60/90 minute boundaries and never refreshes a stale server decision", () => {
  expect(ageStation(station, now).data_status).toBe("fresh");
  expect(ageStation(station, now + 1).data_status).toBe("delayed");
  expect(ageStation(station, now + 30 * 60000 + 1).data_status).toBe("expired");
  expect(
    ageStation(
      { ...station, data_status: "expired", eligible_for_surface: false },
      now,
    ).data_status,
  ).toBe("expired");
  expect(
    ageStation({ ...station, recorded_at: null }, now).eligible_for_surface,
  ).toBe(false);
});
