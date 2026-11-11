import { expect, it } from "vitest";
import { stationHistorySlots, stationHistorySummary } from "./station-insights";
const end = Date.parse("2026-11-11T10:30:00Z");
const p = (at: string, value: number | null) => ({
  recorded_at: at,
  pm25: value,
  aqi: null,
});
it("keeps hourly gaps and rejects future, old, missing and invalid observations", () => {
  const slots = stationHistorySlots(
    [
      p("2026-11-11T10:00:00Z", 40),
      p("2026-11-11T08:00:00Z", 20),
      p("2026-11-11T10:31:00Z", 500),
      p("2026-11-10T09:00:00Z", 999),
      p("invalid", 50),
      p("2026-11-11T09:00:00Z", NaN),
      p("2026-11-11T09:15:00Z", -1),
    ],
    end,
  );
  expect(slots).toHaveLength(24);
  expect(slots[22].value).toBeNull();
  expect(slots[23].value).toBe(40);
  expect(stationHistorySummary(slots)).toEqual({
    count: 2,
    min: 20,
    max: 40,
    delta: null,
  });
});
it("uses the latest observation per hour and compares only adjacent hours", () => {
  const slots = stationHistorySlots(
    [
      p("2026-11-11T10:15:00Z", 42),
      p("2026-11-11T09:00:00Z", 20),
      p("2026-11-11T10:00:00Z", 40),
    ],
    end,
  );
  expect(stationHistorySummary(slots)).toEqual({
    count: 2,
    min: 20,
    max: 42,
    delta: 22,
  });
});
it("distinguishes zero measurements from missing data", () => {
  const slots = stationHistorySlots([p("2026-11-11T10:00:00Z", 0)], end);
  expect(stationHistorySummary(slots)).toEqual({
    count: 1,
    min: 0,
    max: 0,
    delta: null,
  });
  expect(stationHistorySummary(stationHistorySlots([], end))).toEqual({
    count: 0,
    min: null,
    max: null,
    delta: null,
  });
});
