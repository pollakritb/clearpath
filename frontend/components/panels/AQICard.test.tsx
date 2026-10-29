import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CommunityReport } from "@/frontend/types";
import AQICard from "./AQICard";

afterEach(cleanup);

describe("community reading on Today", () => {
  it("shows the report value and source without offering station history", () => {
    render(
      <AQICard
        station={null}
        report={
          {
            id: "report",
            display_name: "เพื่อนบ้าน",
            pm25: 42,
            captured_at: "2026-10-28T00:00:00Z",
            province: null,
          } as CommunityReport
        }
        distanceKm={0.2}
        showHistory={true}
        onToggleHistory={vi.fn()}
        historyPoints={[]}
        historyLoading={false}
        onOpenMap={vi.fn()}
      />,
    );
    expect(screen.getByText("รายงานจาก เพื่อนบ้าน")).toBeTruthy();
    expect(screen.getByText("42")).toBeTruthy();
    expect(screen.getByText("รายงานชุมชน · ห่างจากคุณ 0.2 กม.")).toBeTruthy();
    expect(screen.queryByText("ยังไม่มีจุดอ้างอิงใกล้คุณ")).toBeNull();
    expect(screen.queryByRole("button", { name: /กราฟ/ })).toBeNull();
  });
});
