import { expect, it } from "vitest";
import { readingAgeLabel, sourceTimeLabel } from "./reading-time";
it("uses source age in minutes around the 60/90 minute boundaries", () => {
  for (const age of [59, 60, 61, 89, 90, 91])
    expect(readingAgeLabel(age)).toBe(`${age} นาทีที่แล้ว`);
  expect(readingAgeLabel(null)).toBe("ไม่ทราบเวลาข้อมูล");
  expect(readingAgeLabel(NaN)).toBe("ไม่ทราบเวลาข้อมูล");
});
it("formats source times in Thailand across midnight and preserves unknown time", () => {
  expect(sourceTimeLabel("2026-11-11T23:00:00Z")).toContain("06:00");
  expect(sourceTimeLabel(null)).toBe("ไม่ทราบเวลาข้อมูล");
  expect(sourceTimeLabel("invalid")).toBe("ไม่ทราบเวลาข้อมูล");
});
