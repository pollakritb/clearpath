import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import MapStatusCard from "./MapStatusCard";

describe("MapStatusCard", () => {
  afterEach(cleanup);

  it("shows a compact current-data dock on the map", () => {
    render(
      <MapStatusCard
        station={null}
        report={null}
        updatedAt="2026-09-17T14:00:00Z"
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

  it("does not expose forecast horizon controls on the map", () => {
    render(
      <MapStatusCard
        station={null}
        report={null}
        updatedAt="2026-09-17T14:00:00Z"
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("ค่าฝุ่นปัจจุบัน")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "ตอนนี้" })).toBeNull();
    expect(screen.queryByRole("button", { name: /\+\d+ชม\./ })).toBeNull();
  });
});
