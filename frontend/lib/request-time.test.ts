import { expect, it } from "vitest";
import { formatRequestDuration } from "./request-time";
it.each([
  [0, "0 นาที"],
  [33, "33 นาที"],
  [60, "60 นาที"],
  [61, "1 ชั่วโมง 1 นาที"],
  [120, "2 ชั่วโมง"],
  [1426, "23 ชั่วโมง 46 นาที"],
])("formats request countdown %s as %s", (minutes, label) => {
  expect(formatRequestDuration(minutes)).toBe(label);
});
