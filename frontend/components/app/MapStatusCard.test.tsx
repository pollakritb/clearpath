import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import MapStatusCard from "./MapStatusCard";

describe("MapStatusCard", () => {
  afterEach(cleanup);

  it("shows a compact current-data dock while forecasting is paused", () => {
    render(
      <MapStatusCard
        station={null}
        report={null}
        updatedAt="2026-09-17T14:00:00Z"
        horizon={0}
        forecastLoading={false}
        forecastError={null}
        forecastWarnings={[]}
        forecastPaused
        onHorizonChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("ค่าฝุ่นปัจจุบัน")).not.toBeNull();
    expect(
      screen.getByText("Air4Thai · ข้อมูลชุมชนที่ผ่านการตรวจ"),
    ).not.toBeNull();
    expect(screen.queryByText("ระบบพยากรณ์กำลังปรับปรุง")).toBeNull();
    expect(screen.queryByRole("button", { name: "+1ชม." })).toBeNull();
  });
});
