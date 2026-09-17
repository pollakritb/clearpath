import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import FireAlertPanel from "./FireAlertPanel";

afterEach(cleanup);

describe("FireAlertPanel", () => {
  it("uses neutral satellite-hotspot wording without a high-watch count", () => {
    render(
      <FireAlertPanel
        fires={[
          ...Array.from({ length: 4 }, (_, index) => ({
            id: `hotspot-${index}`,
            lat: 13.8 + index / 100,
            lon: 100.1 + index / 100,
            frp: 25 - index,
            bright: null,
            daynight: null,
            acq_date: null,
            acquired_at: null,
            confidence: null,
            satellite: null,
            source_products: [],
          })),
        ]}
        loading={false}
        status="available"
        message={null}
        checkedAt={null}
        error={null}
        onShowLayer={vi.fn()}
      />,
    );

    expect(
      screen.getByText("พบสัญญาณจุดความร้อนจากดาวเทียมในนครปฐม"),
    ).not.toBeNull();
    expect(screen.queryByText(/เฝ้าระวังสูง|เฝ้าระวัง:|พบ 4 จุด/)).toBeNull();
    expect(screen.getByText(/ไม่ใช่เหตุไฟไหม้ที่ยืนยันแล้ว/)).not.toBeNull();
  });
});
