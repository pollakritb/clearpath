import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import type { Station } from "@/frontend/types";
import StationDetails from "./StationDetails";

afterEach(cleanup);
const station = {
  id: "81t",
  name_th: "สถานีทดสอบ",
  name_en: "Example station",
  province: "กรุงเทพมหานคร",
  pm25: 20,
  data_status: "fresh",
  age_minutes: 10,
  eligible_for_surface: true,
  recorded_at: "2026-11-11T10:00:00Z",
} as Station;
it("explains source, location, measurement level and conditional place eligibility", () => {
  render(<StationDetails station={station} />);
  expect(screen.getByText("ระดับของค่าที่บันทึก: ดี")).toBeTruthy();
  expect(screen.getByText(/ใช้ได้เมื่ออยู่ในรัศมี 2 กม./)).toBeTruthy();
  expect(screen.getByText("Example station")).toBeTruthy();
  expect(screen.getByText("รหัสสถานี 81t")).toBeTruthy();
  const link = screen.getByRole("link", { name: /ดูข้อมูลจาก Air4Thai/ });
  expect(link.getAttribute("href")).toBe("https://air4thai.pcd.go.th/");
  expect(link.getAttribute("rel")).toContain("noopener");
});
it("describes the recorded level without presenting previous data as current", () => {
  render(
    <StationDetails
      station={{ ...station, data_status: "delayed", age_minutes: 73 }}
    />,
  );
  expect(screen.getByText("ข้อมูลก่อนหน้า")).toBeTruthy();
  expect(screen.getByText("ไม่ใช้คำนวณค่าปัจจุบัน")).toBeTruthy();
  expect(screen.getByText(/ไม่ได้ยืนยันสภาพอากาศขณะนี้/)).toBeTruthy();
  expect(screen.queryByText(/ใช้ได้เมื่ออยู่ในรัศมี/)).toBeNull();
});
it("handles missing measurement, time and area without fabricated facts", () => {
  render(
    <StationDetails
      station={{
        ...station,
        pm25: null,
        recorded_at: null,
        age_minutes: null,
        province: null,
      }}
    />,
  );
  expect(screen.getByText(/ยังไม่มีค่า PM2.5 ที่ใช้แปลผลได้/)).toBeTruthy();
  expect(screen.getAllByText("ไม่ทราบเวลาข้อมูล")).toHaveLength(2);
  expect(screen.getByText("ไม่ทราบอายุข้อมูล")).toBeTruthy();
  expect(screen.getByText("ไม่ระบุพื้นที่")).toBeTruthy();
});
it("keeps historical readings out of current place eligibility", () => {
  render(<StationDetails station={station} historical />);
  expect(screen.getByText("ข้อมูลย้อนหลัง")).toBeTruthy();
  expect(screen.getByText("ไม่ใช้คำนวณค่าปัจจุบัน")).toBeTruthy();
  expect(screen.queryByText("อายุข้อมูล")).toBeNull();
});
