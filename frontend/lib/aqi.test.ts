import { describe, expect, it } from "vitest";

import { classifyPm25 } from "./aqi";

describe("classifyPm25", () => {
  it.each([
    [0, "very_good"],
    [15, "very_good"],
    [15.1, "good"],
    [25, "good"],
    [25.1, "moderate"],
    [37.5, "moderate"],
    [37.6, "sensitive"],
    [75, "sensitive"],
    [75.1, "unhealthy"],
  ] as const)("maps %s µg/m³ to %s", (value, level) => {
    expect(classifyPm25(value).levelKey).toBe(level);
  });

  it("treats missing and NaN values as unknown", () => {
    expect(classifyPm25(null).levelKey).toBe("unknown");
    expect(classifyPm25(Number.NaN).levelKey).toBe("unknown");
  });
});

import { classifyForecastPm25 } from "./aqi";
describe("forecast-only scale", () => {
  it.each([
    [0, "#50f0e6"],
    [5, "#50f0e6"],
    [5.001, "#50ccaa"],
    [15, "#50ccaa"],
    [15.001, "#f0e641"],
    [50, "#f0e641"],
    [50.001, "#ff5050"],
    [90, "#ff5050"],
    [90.001, "#960032"],
    [140, "#960032"],
    [140.001, "#7d2181"],
  ] as const)(
    "classifies %s without rounding across a threshold",
    (value, color) => expect(classifyForecastPm25(value).color).toBe(color),
  );
  it("keeps missing/invalid forecasts neutral and observed PM2.5 on its existing scale", () => {
    for (const value of [null, undefined, NaN, Infinity, -1])
      expect(classifyForecastPm25(value).color).toBe("#95a5a6");
    expect(classifyPm25(10).color).toBe("#3b82f6");
    expect(classifyForecastPm25(10).color).toBe("#50ccaa");
  });
});

describe("forecast category readability", () => {
  const luminance = (hex: string) => {
    const channels = hex
      .slice(1)
      .match(/../g)!
      .map((n) => Number.parseInt(n, 16) / 255)
      .map((n) => (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4));
    return channels.reduce(
      (sum, n, i) => sum + n * [0.2126, 0.7152, 0.0722][i],
      0,
    );
  };
  const contrast = (a: string, b: string) =>
    (Math.max(luminance(a), luminance(b)) + 0.05) /
    (Math.min(luminance(a), luminance(b)) + 0.05);
  it.each([0, 10, 30, 70, 110, 200])(
    "keeps the category and makes marker/value text readable at %s",
    (value) => {
      const c = classifyForecastPm25(value);
      expect(contrast(c.textColor, "#ffffff")).toBeGreaterThanOrEqual(4.5);
      expect(contrast(c.foreground, c.color)).toBeGreaterThanOrEqual(4.5);
    },
  );
});
