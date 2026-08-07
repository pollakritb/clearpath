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
