import Image from "next/image";

import { T } from "@/frontend/lib/ui";
import type { CommunityReport } from "@/frontend/types";

function EvidenceMetric({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ background: T.chip, padding: ".55em", borderRadius: "8px" }}>
      <b>{label}</b>
      <br />
      {children}
    </div>
  );
}

export default function ReportEvidenceSummary({
  report,
}: {
  report: CommunityReport;
}) {
  return (
    <>
      {report.image_url && (
        <Image
          unoptimized
          src={report.image_url}
          alt="หลักฐานหน้าจอเครื่องวัด PM2.5"
          width={960}
          height={720}
          className="cp-admin-report-image"
        />
      )}

      {report.duplicate_detected && (
        <div role="alert" className="cp-admin-duplicate-warning">
          ภาพคล้ายรายงานเดิม ระบบหัก Trust เบื้องต้นแล้ว โปรดตรวจอย่างละเอียด
        </div>
      )}

      <div className="cp-admin-evidence-grid">
        <EvidenceMetric label="OCR ช่วยอ่าน">
          {report.ocr_pm25 ?? "ไม่พร้อม"} ·{" "}
          {Math.round(report.ocr_confidence * 100)}%
        </EvidenceMetric>
        <EvidenceMetric label="ค่าที่ผู้ใช้ยืนยัน">
          {report.user_claimed_pm25 ?? "ไม่ระบุ"} µg/m³
          {report.ocr_mismatch ? " · ต่างจาก OCR มาก" : ""}
        </EvidenceMetric>
        <EvidenceMetric label="Air4Thai ใกล้สุด">
          {report.nearest_official_pm25 ?? "ไม่มีค่า"} ·{" "}
          {report.nearest_official_distance_km?.toFixed(1) ?? "–"} กม.
        </EvidenceMetric>
        <EvidenceMetric label="เครื่องวัด">
          {report.device_model ?? "ไม่ระบุ"}
          {report.device_calibrated
            ? ` · สอบเทียบ ${report.calibrated_at ?? "แล้ว"}`
            : " · ไม่ระบุการสอบเทียบ"}
        </EvidenceMetric>
        <EvidenceMetric label="GPS จริงสำหรับ Admin">
          {report.lat.toFixed(5)}, {report.lon.toFixed(5)} · ±
          {Math.round(report.gps_accuracy_m ?? 0)} ม.
        </EvidenceMetric>
      </div>

      <div className="cp-admin-evidence-time">
        Camera session: {report.camera_session_issued_at ?? "—"} · ถ่าย:{" "}
        {report.client_captured_at ?? report.captured_at}
        {report.clock_warning ? " · เวลาเครื่องผิดปกติ ใช้เวลา server แทน" : ""}
      </div>
    </>
  );
}
