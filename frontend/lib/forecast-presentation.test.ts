import { describe, expect, it } from "vitest";

import type { ForecastResponse } from "@/frontend/types";

import {
  agreementLabel,
  forecastIntervalHint,
  forecastStatus,
  formatForecastTime,
} from "./forecast-presentation";

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
});
