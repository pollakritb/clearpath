import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import MapStatusCard from "./MapStatusCard";
import type { CommunityReport, Station } from "@/frontend/types";

vi.mock("@/frontend/components/community/ReportEngagement", () => ({
  default: () => null,
}));

afterEach(cleanup);

describe("MapStatusCard", () => {
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

    expect(screen.getByText("42")).not.toBeNull();
    expect(screen.queryByRole("region", { name: "ผู้รายงาน" })).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "ดูรายละเอียดรายงานและผู้รายงาน" }),
    );
    const photo = screen.getByRole("button", {
      name: "เปิดดูภาพเครื่องวัดจากรายงานนี้",
    });
    expect(photo.getAttribute("href")).toBeNull();
    expect(
      screen.getByAltText("ภาพหน้าจอเครื่องวัด PM2.5 จากผู้รายงาน"),
    ).not.toBeNull();
    expect(screen.getByText("ดูภาพเครื่องวัดที่ส่งมา")).not.toBeNull();
    expect(screen.getByText("แตะเพื่อขยายภาพในหน้านี้")).not.toBeNull();
    const dialog = document.querySelector("dialog") as HTMLDialogElement;
    expect(dialog).not.toBeNull();
    dialog.showModal = () => dialog.setAttribute("open", "");
    dialog.close = () => dialog.removeAttribute("open");
    fireEvent.click(photo);
    expect(dialog.hasAttribute("open")).toBe(true);
    expect(
      screen.getByRole("dialog", { name: "ภาพเครื่องวัดจากรายงานนี้" }),
    ).not.toBeNull();
    expect(
      screen.getByAltText("ภาพเครื่องวัด PM2.5 ฉบับเต็มจากผู้รายงาน"),
    ).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "ปิดภาพเครื่องวัด" }));
    expect(dialog.hasAttribute("open")).toBe(false);
    expect(
      screen.getByRole("region", { name: "ข้อมูลรายงานค่าฝุ่น" }),
    ).not.toBeNull();
    expect(screen.getByRole("region", { name: "ผู้รายงาน" })).not.toBeNull();

    const reading = screen.getByText("42");
    const reporter = screen.getByText("ไม่เปิดเผยตัวตน");
    expect(
      reading.compareDocumentPosition(reporter) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /กลับไปแผนที่/ }));
    expect(screen.queryByRole("region", { name: "ผู้รายงาน" })).toBeNull();
  });

  it("shows complete station identity on the pin without an expanded details screen", () => {
    render(
      <MapStatusCard
        station={
          {
            id: "85t",
            name_th: "สนามกีฬากลางจังหวัดสุพรรณบุรี",
            province: "ต.ดอนกำยาน อ.เมือง สุพรรณบุรี",
            pm25: 17.6,
          } as Station
        }
        report={null}
        updatedAt={null}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText("สนามกีฬากลางจังหวัดสุพรรณบุรี")).toBeTruthy();
    expect(
      screen.getByText(/ต.ดอนกำยาน อ.เมือง สุพรรณบุรี · รหัสสถานี 85t/),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "ดูรายละเอียดสถานี" }),
    ).toBeNull();
    expect(
      screen.queryByRole("region", { name: "พยากรณ์ PM2.5 รายชั่วโมง" }),
    ).toBeNull();
    expect(document.querySelector('a[href^="/air"]')).toBeNull();
  });
});

it.each([true, false])(
  "shows the report avatar rank only when identity is public: %s",
  (visible) => {
    const report = {
      id: "rank-report",
      source_type: "individual",
      show_reporter_profile: visible,
      display_name: visible ? "Google Member" : "สายลม",
      reporter_avatar_url: visible
        ? "https://lh3.googleusercontent.com/a/member"
        : null,
      pm25: 28,
      participation_rank: {
        code: "guardian",
        label: "ผู้พิทักษ์อากาศ",
        minimum_xp: 1500,
        minimum_days: 20,
        next_label: null,
        next_xp: null,
        next_days: null,
      },
    } as CommunityReport;
    const { container } = render(
      <MapStatusCard
        station={null}
        report={report}
        updatedAt="2026-11-01T12:00:00Z"
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "ดูรายละเอียดรายงานและผู้รายงาน" }),
    );
    expect(
      Boolean(
        container.querySelector(".cp-map-reporter-avatar .cp-rank-emblem"),
      ),
    ).toBe(visible);
    cleanup();
  },
);

it("opens the existing map timeline from the top corner of a station pin", () => {
  const open = vi.fn();
  render(
    <MapStatusCard
      station={
        { id: "81t", name_th: "อ่างเก็บน้ำประปา", pm25: 22.5 } as Station
      }
      report={null}
      updatedAt={null}
      onClose={vi.fn()}
      onOpenHistory={open}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "ดูย้อนหลังและพยากรณ์ของสถานีนี้" }),
  );
  expect(open).toHaveBeenCalledOnce();
  expect(
    screen.queryByRole("region", {
      name: "ค่าตรวจวัดสถานีย้อนหลัง 24 ชั่วโมง",
    }),
  ).toBeNull();
});
