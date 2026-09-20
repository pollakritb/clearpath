import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import MapStatusCard from "./MapStatusCard";
import type { CommunityReport } from "@/frontend/types";

vi.mock("@/frontend/components/community/ReportEngagement", () => ({
  default: () => null,
}));

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

  it("lets other users open the submitted photo from an individual report pin", () => {
    const report = {
      id: "report-1",
      source_type: "individual",
      show_reporter_profile: false,
      image_url: "https://storage.example.test/signed-report-image",
      pm25: 42,
      verified_pm25: 42,
      user_claimed_pm25: 42,
      verification_method: "automatic",
      device_calibrated: false,
      age_minutes: 5,
      rating_count: 0,
      like_count: 0,
      dislike_count: 0,
      comment_count: 0,
    } as CommunityReport;

    render(
      <MapStatusCard
        station={null}
        report={report}
        updatedAt="2026-09-20T01:00:00Z"
        onClose={vi.fn()}
      />,
    );

    const photo = screen.getByRole("link", {
      name: "เปิดดูภาพเครื่องวัดจากรายงานนี้",
    });
    expect(photo.getAttribute("href")).toBe(report.image_url);
    expect(
      screen.getByAltText("ภาพหน้าจอเครื่องวัด PM2.5 จากผู้รายงาน"),
    ).not.toBeNull();
  });
});
