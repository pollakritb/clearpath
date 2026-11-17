import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import ReportEvidenceSummary from "./ReportEvidenceSummary";
import type { CommunityReport } from "@/frontend/types";

afterEach(cleanup);

const report = {
  source_type: "individual",
  lat: 13.82,
  lon: 100.06,
  location_precision_m: 180,
  gps_accuracy_m: null,
  ocr_pm25: 22,
  ocr_confidence: 0.9,
  image_metadata: null,
} as CommunityReport;

it("labels a moderator's obfuscated location with its actual precision", () => {
  render(<ReportEvidenceSummary report={report} />);
  expect(screen.getByText("ตำแหน่งโดยประมาณ")).toBeTruthy();
  expect(screen.getByText(/±180 ม\./)).toBeTruthy();
  expect(screen.queryByText("ตำแหน่งที่วัดสำหรับ Admin")).toBeNull();
  expect(screen.queryByText("ข้อมูลไฟล์และเวลาของภาพ (Admin)")).toBeNull();
  expect(screen.getByText(/22 · 90%/)).toBeTruthy();
});

it("retains the exact-location label and GPS accuracy for an admin response", () => {
  render(
    <ReportEvidenceSummary
      report={{ ...report, location_precision_m: 0, gps_accuracy_m: 15 }}
    />,
  );
  expect(screen.getByText("ตำแหน่งที่วัดสำหรับ Admin")).toBeTruthy();
  expect(screen.getByText(/±15 ม\./)).toBeTruthy();
  expect(screen.queryByText("ตำแหน่งโดยประมาณ")).toBeNull();
});
