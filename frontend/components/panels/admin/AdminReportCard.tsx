import type { CommunityReport } from "@/frontend/types";

import ReportEvidenceSummary from "./ReportEvidenceSummary";

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "ไม่ทราบเวลา"
    : date.toLocaleString("th-TH", {
        dateStyle: "medium",
        timeStyle: "short",
      });
}

export default function AdminReportCard({
  report,
}: {
  report: CommunityReport;
}) {
  const approved = report.status === "approved";
  const pending = report.status === "pending";
  const statusTone = approved ? "success" : pending ? "running" : "failed";
  const statusLabel = approved
    ? "เผยแพร่แล้ว"
    : pending
      ? "กำลังประมวลผล"
      : "ไม่ผ่านเกณฑ์";

  return (
    <article className="cp-admin-report-card">
      <header className="cp-admin-report-card__header">
        <div>
          <small>ส่งเมื่อ {formatDate(report.created_at)}</small>
          <strong>{report.device_model ?? "ไม่ระบุรุ่นเครื่องวัด"}</strong>
        </div>
        <span className="cp-admin-status" data-status={statusTone}>
          {statusLabel}
        </span>
      </header>

      <ReportEvidenceSummary report={report} />

      <dl className="cp-admin-report-result">
        <div>
          <dt>ผลระบบ</dt>
          <dd>
            {approved
              ? `PM2.5 ${report.verified_pm25 ?? "—"} µg/m³`
              : pending
                ? "กำลังรอผล OCR"
                : "ไม่เผยแพร่บนแผนที่"}
          </dd>
        </div>
        <div>
          <dt>วิธีตรวจ</dt>
          <dd>OCR อ่านตัวเลข PM2.5 อัตโนมัติ</dd>
        </div>
        <div>
          <dt>รหัสรายงาน</dt>
          <dd>{report.id}</dd>
        </div>
        {!approved && !pending && (
          <div>
            <dt>เหตุผล</dt>
            <dd>{report.rejection_reason_code ?? "ไม่ผ่านกฎคุณภาพ"}</dd>
          </div>
        )}
      </dl>

      {!!report.trust_reasons.length && (
        <details className="cp-admin-report-reasons">
          <summary>ดูเหตุผลและสัญญาณที่ระบบบันทึก</summary>
          <ul>
            {report.trust_reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}
