import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import HelperPlaceAddress from "./HelperPlaceAddress";
const reverse = vi.hoisted(() => vi.fn());
vi.mock("@/frontend/lib/api-client", () => ({
  api: { reverseLocation: reverse },
}));
afterEach(cleanup);
it("fills a saved home's missing place and district/province from its own coordinates", async () => {
  reverse.mockResolvedValue({
    name: "บริเวณสถานที่ทดสอบ",
    address: "อำเภอกำแพงแสน · จังหวัดนครปฐม",
    source: "photon",
  });
  render(
    <>
      <strong>บ้าน</strong>
      <HelperPlaceAddress
        place={{
          slot: 1,
          name: "บ้าน",
          address: "",
          lat: 14.023,
          lon: 99.974,
          enabled: true,
        }}
      />
    </>,
  );
  expect(
    await screen.findByText(
      "บริเวณสถานที่ทดสอบ · อำเภอกำแพงแสน · จังหวัดนครปฐม",
    ),
  ).toBeTruthy();
  expect(screen.getByText("บ้าน")).toBeTruthy();
  expect(reverse).toHaveBeenCalledWith(14.023, 99.974);
});
