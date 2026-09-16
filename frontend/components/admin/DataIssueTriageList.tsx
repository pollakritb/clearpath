"use client";

import { useMemo, useState } from "react";

import type { DataIssueRow, DataIssueUpdateRequest } from "@/frontend/types/ui";

const STATUS_LABELS: Record<DataIssueRow["status"], string> = {
  new: "ใหม่",
  reviewing: "กำลังตรวจ",
  resolved: "แก้ไขแล้ว",
  dismissed: "ไม่ดำเนินการ",
};

export default function DataIssueTriageList({
  issues,
  onTransition,
}: {
  issues: DataIssueRow[];
  onTransition: (
    issue: DataIssueRow,
    body: DataIssueUpdateRequest,
  ) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const visibleIssues = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return issues;
    return issues.filter((issue) =>
      [issue.category, issue.reference_id, issue.message, issue.status]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle)),
    );
  }, [issues, query]);
  if (!issues.length) {
    return (
      <div className="cp-admin-empty">ยังไม่มีรายการแจ้งข้อมูลผิดพลาด</div>
    );
  }
  return (
    <div className="cp-admin-issue-list">
      <label className="cp-admin-audit-search">
        ค้นหาปัญหาข้อมูล
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="หมวด รหัสอ้างอิง หรือข้อความ"
        />
      </label>
      {visibleIssues.map((issue) => (
        <DataIssueRowItem
          key={issue.id}
          issue={issue}
          onTransition={onTransition}
        />
      ))}
      {!visibleIssues.length && (
        <div className="cp-admin-empty">ไม่พบรายการที่ค้นหา</div>
      )}
    </div>
  );
}

function DataIssueRowItem({
  issue,
  onTransition,
}: {
  issue: DataIssueRow;
  onTransition: (
    issue: DataIssueRow,
    body: DataIssueUpdateRequest,
  ) => Promise<void>;
}) {
  const terminal = issue.status === "resolved" || issue.status === "dismissed";
  const [status, setStatus] = useState<DataIssueUpdateRequest["status"]>(
    issue.status === "new" ? "reviewing" : "resolved",
  );
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (reason.trim().length < 10) {
      setError("กรุณาระบุผลตรวจอย่างน้อย 10 ตัวอักษร");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onTransition(issue, {
        status,
        reason: reason.trim(),
        expected_updated_at: issue.updated_at,
      });
      setReason("");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "บันทึกผลตรวจไม่สำเร็จ",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="cp-admin-issue-row">
      <header>
        <span>{issue.category}</span>
        <b data-status={issue.status}>{STATUS_LABELS[issue.status]}</b>
      </header>
      <strong>{issue.reference_id ?? "ไม่มีรหัสอ้างอิง"}</strong>
      <p>{issue.message}</p>
      <small>{formatDate(issue.created_at)}</small>
      {!terminal && (
        <div className="cp-admin-issue-actions">
          <label>
            สถานะถัดไป
            <select
              value={status}
              disabled={busy}
              onChange={(event) =>
                setStatus(
                  event.target.value as DataIssueUpdateRequest["status"],
                )
              }
            >
              {issue.status === "new" && (
                <option value="reviewing">กำลังตรวจ</option>
              )}
              <option value="resolved">แก้ไขแล้ว</option>
              <option value="dismissed">ไม่ดำเนินการ</option>
            </select>
          </label>
          <label>
            ผลตรวจและเหตุผล
            <textarea
              rows={2}
              value={reason}
              disabled={busy}
              onChange={(event) => setReason(event.target.value)}
              placeholder="บันทึกสิ่งที่ตรวจและเหตุผลของสถานะใหม่"
            />
          </label>
          {error && <small role="alert">{error}</small>}
          <button type="button" disabled={busy} onClick={() => void save()}>
            {busy ? "กำลังบันทึก…" : "บันทึกผลตรวจ"}
          </button>
        </div>
      )}
    </article>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
