import { describe, expect, it } from "vitest";

import type { ForecastPoint, ForecastResponse } from "@/frontend/types";

import {
  agreementLabel,
  FORECAST_SOURCE_LABELS,
  formatForecastTimelineTime,
  forecastIntervalHint,
  forecastMethodLabel,
  forecastStatus,
  formatForecastTime,
  formatProviderTime,
} from "./forecast-presentation";

describe("formatForecastTimelineTime", () => {
  it("labels local tomorrow timestamps without hiding the clock time", () => {
    const now = new Date("2026-09-18T16:30:00+07:00");
    expect(
      formatForecastTimelineTime("2026-09-19T01:00:00+07:00", now),
    ).toEqual({ day: "พรุ่งนี้", time: "01:00" });
  });
});

function response(overrides: Partial<ForecastResponse> = {}): ForecastResponse {
  return {
    provider_count: 3,
    agreement: "high",
    forecast_status: "available",
    ...overrides,
  } as ForecastResponse;
}

describe("forecast presentation", () => {
  it("uses relative Thai labels for today and tomorrow", () => {
    const now = new Date(2026, 8, 15, 9);
    expect(formatForecastTime("2026-09-15T12:00:00+07:00", now)).toContain(
      "วันนี้",
    );
    expect(formatForecastTime("2026-09-16T12:00:00+07:00", now)).toContain(
      "พรุ่งนี้",
    );
  });

  it("falls back to absolute provider time outside the relative window", () => {
    const now = new Date(2026, 8, 15, 9);
    const value = "2026-09-12T12:00:00+07:00";
    expect(formatForecastTime(value, now)).toBe(formatProviderTime(value));
    expect(formatForecastTime(null, now)).toBe(formatProviderTime(null));
    expect(formatForecastTime("not-a-date", now)).toBe(
      formatProviderTime("not-a-date"),
    );
  });

  it("does not describe disagreeing providers as close", () => {
    const data = response({ agreement: "low" });
    expect(agreementLabel(data)).toBe("ต่างกันมาก");
    expect(forecastStatus(data)).toBe("ความมั่นใจต่ำ");
    expect(forecastIntervalHint(data)).toContain("ต่างกันมาก");
    expect(forecastIntervalHint(data)).not.toContain("ใกล้กัน");
  });

  it("explains that a single provider cannot be compared", () => {
    const data = response({ provider_count: 1, agreement: null });
    expect(agreementLabel(data)).toBe("ยังเปรียบเทียบไม่ได้");
    expect(forecastIntervalHint(data)).toContain("เพียงแหล่งเดียว");
  });

  it("presents high, medium, limited, and unavailable states distinctly", () => {
    const high = response();
    const medium = response({ agreement: "medium" });
    const limited = response({ forecast_status: "limited" });
    const unavailable = response({
      forecast_status: "unavailable",
      agreement: null,
    });

    expect(agreementLabel(high)).not.toBe(agreementLabel(medium));
    expect(forecastIntervalHint(high)).not.toBe(forecastIntervalHint(medium));
    expect(forecastStatus(high)).not.toBe(forecastStatus(limited));
    expect(forecastStatus(unavailable)).not.toBe(forecastStatus(high));
  });

  it("labels external, released, and fallback forecast methods", () => {
    const point = { model_version: null } as ForecastPoint;

    expect(forecastMethodLabel(point, "openweather")).toContain(
      FORECAST_SOURCE_LABELS.openweather,
    );
    expect(
      forecastMethodLabel({ ...point, model_version: "model-v1" }, "clearpath"),
    ).not.toBe(forecastMethodLabel(point, "clearpath"));
  });
});
