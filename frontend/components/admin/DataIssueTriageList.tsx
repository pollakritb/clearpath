import type { DataIssueRow } from "@/frontend/types/ui";
const LABELS: Record<DataIssueRow["status"], string> = {
  new: "ใหม่",
  reviewing: "กำลังตรวจ",
  resolved: "แก้ไขแล้ว",
  dismissed: "ไม่ดำเนินการ",
};
export default function DataIssueTriageList({
  issues,
}: {
  issues: DataIssueRow[];
}) {
  return (
    <div>
      {issues.map((issue) => (
        <article key={issue.id} className="cp-admin-issue-row">
          <header>
            <span>{issue.category}</span>
            <b data-status={issue.status}>{LABELS[issue.status]}</b>
          </header>
          <strong>{issue.reference_id ?? "ไม่มีรหัสอ้างอิง"}</strong>
          <p>{issue.message}</p>
          <small>{new Date(issue.created_at).toLocaleString("th-TH")}</small>
        </article>
      ))}
      {!issues.length && (
        <p className="cp-admin-empty">ยังไม่มีประวัติแจ้งข้อมูลผิดพลาด</p>
      )}
    </div>
  );
}
