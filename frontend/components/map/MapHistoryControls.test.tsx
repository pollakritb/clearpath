import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import MapHistoryControls from "./MapHistoryControls";

describe("MapHistoryControls", () => {
  it("exposes an accessible 24-hour timeline and current-mode action", () => {
    const onOffsetChange = vi.fn();
    const onReturnCurrent = vi.fn();
    render(
      <MapHistoryControls
        offsetHours={6}
        targetAt="2026-09-19T03:00:00.000Z"
        stationCount={42}
        loading={false}
        error={null}
        onOffsetChange={onOffsetChange}
        onReturnCurrent={onReturnCurrent}
      />,
    );

    expect(screen.getByText("42 สถานี")).not.toBeNull();
    const slider = screen.getByRole("slider", {
      name: "เลือกชั่วโมงย้อนหลัง",
    });
    fireEvent.change(slider, { target: { value: "21" } });
    expect(onOffsetChange).toHaveBeenCalledWith(3);

    fireEvent.click(screen.getByRole("button", { name: "ตอนนี้" }));
    expect(onReturnCurrent).toHaveBeenCalledOnce();
  });
});
