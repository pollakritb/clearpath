import { expect, it } from "vitest";
import { readingAgeLabel, sourceTimeLabel } from "./reading-time";
it.each([
  [0, "0 นาทีที่แล้ว"],
  [59, "59 นาทีที่แล้ว"],
  [60, "1 ชม. 0 นาทีที่แล้ว"],
  [61, "1 ชม. 1 นาทีที่แล้ว"],
  [116, "1 ชม. 56 นาทีที่แล้ว"],
  [120, "2 ชม. 0 นาทีที่แล้ว"],
  [124, "2 ชม. 4 นาทีที่แล้ว"],
  [179, "2 ชม. 59 นาทีที่แล้ว"],
  [180, "3 ชม. 0 นาทีที่แล้ว"],
  [119.9, "1 ชม. 59 นาทีที่แล้ว"],
])(
  "shows elapsed age %s without rounding into another freshness interval",
  (age, label) => {
    expect(readingAgeLabel(age)).toBe(label);
  },
);
it.each([null, NaN, Infinity, -1])(
  "handles unknown or invalid source age %s",
  (age) => {
    expect(readingAgeLabel(age)).toBe("ไม่ทราบเวลาข้อมูล");
  },
);
it("formats source times in Thailand across midnight and preserves unknown time", () => {
  expect(sourceTimeLabel("2026-11-11T23:00:00Z")).toContain("06:00");
  expect(sourceTimeLabel(null)).toBe("ไม่ทราบเวลาข้อมูล");
  expect(sourceTimeLabel("invalid")).toBe("ไม่ทราบเวลาข้อมูล");
});
