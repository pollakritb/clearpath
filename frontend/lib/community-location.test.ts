import { describe, expect, it } from "vitest";

import { formatCommunityArea } from "./community-location";

describe("formatCommunityArea", () => {
  it("formats separate administrative fields", () => {
    expect(
      formatCommunityArea({
        subdistrict: "สนามจันทร์",
        district: "เมืองนครปฐม",
        province: "นครปฐม",
      }),
    ).toBe("ต.สนามจันทร์ · อ.เมืองนครปฐม · จ.นครปฐม");
  });

  it("does not duplicate a detailed station-style province label", () => {
    expect(
      formatCommunityArea({
        subdistrict: null,
        district: "เมืองนครปฐม",
        province: "ต.นครปฐม อ.เมือง, นครปฐม",
      }),
    ).toBe("ต.นครปฐม · อ.เมือง · จ.นครปฐม");
  });

  it("falls back when no public area is available", () => {
    expect(
      formatCommunityArea({
        subdistrict: null,
        district: null,
        province: null,
      }),
    ).toBe("พื้นที่รายงานโดยประมาณ");
  });
});
