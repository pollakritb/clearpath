import { expect, it } from "vitest";
import {
  escapeMarkerText,
  requestPlaceParts,
  requestPlaceTitle,
  storedRequestPlace,
  UNKNOWN_REQUEST_PLACE,
} from "./request-place";
it("stores a consistent title and supporting area without duplicating the prefix", () => {
  const stored = storedRequestPlace({
    name: "Central Embassy",
    address: "ปทุมวัน · กรุงเทพมหานคร",
  });
  expect(stored).toBe("บริเวณCentral Embassy\nปทุมวัน · กรุงเทพมหานคร");
  expect(requestPlaceParts(stored)).toEqual({
    title: "บริเวณCentral Embassy",
    shortName: "Central Embassy",
    address: "ปทุมวัน · กรุงเทพมหานคร",
  });
  expect(requestPlaceTitle("บริเวณกำแพงแสน")).toBe("บริเวณกำแพงแสน");
});
it("uses a neutral label for legacy generic points and abbreviates only common names", () => {
  expect(requestPlaceParts("จุดที่เลือกบนแผนที่").title).toBe(
    UNKNOWN_REQUEST_PLACE,
  );
  expect(
    requestPlaceParts("บริเวณมหาวิทยาลัยเกษตรศาสตร์ วิทยาเขตกำแพงแสน")
      .shortName,
  ).toBe("ม.เกษตรฯ กำแพงแสน");
  expect(
    storedRequestPlace({ name: "a".repeat(200), address: "b".repeat(200) })
      .length,
  ).toBeLessThanOrEqual(160);
});
it("escapes untrusted provider names before marker HTML insertion", () => {
  expect(escapeMarkerText('<img src="x" onerror=alert(1)>&')).toBe(
    "&lt;img src=&quot;x&quot; onerror=alert(1)&gt;&amp;",
  );
});
