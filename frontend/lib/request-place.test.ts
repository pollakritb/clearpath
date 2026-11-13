import { expect, it } from "vitest";
import {
  escapeMarkerText,
  coordinatePlaceTitle,
  requestPlaceParts,
  requestPlaceTitle,
  storedRequestPlace,
  UNKNOWN_REQUEST_PLACE,
} from "./request-place";
it("identifies an unresolved coordinate without inventing a nearby place name", () => {
  const name = coordinatePlaceTitle(15.3418, 99.99825);
  expect(name).toBe("จุดที่เลือก (15.34180, 99.99825)");
  expect(requestPlaceTitle(name)).toBe(name);
});
it("shows the place name directly and removes the legacy area prefix", () => {
  const stored = storedRequestPlace({
    name: "Central Embassy",
    address: "ปทุมวัน · กรุงเทพมหานคร",
  });
  expect(stored).toBe("Central Embassy\nปทุมวัน · กรุงเทพมหานคร");
  expect(requestPlaceParts(stored)).toEqual({
    title: "Central Embassy",
    shortName: "Central Embassy",
    address: "ปทุมวัน · กรุงเทพมหานคร",
  });
  expect(requestPlaceTitle("บริเวณกำแพงแสน")).toBe("กำแพงแสน");
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
