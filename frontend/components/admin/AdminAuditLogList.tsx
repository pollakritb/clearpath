"use client";

import { useMemo, useState } from "react";

import { api, apiErrorMessage } from "@/frontend/lib/api-client";
import type { AuditLogRow } from "@/frontend/types/ui";

export default function AdminAuditLogList({
  logs,
  hasMore,
  loadingMore,
  onLoadMore,
}: {
  logs: AuditLogRow[];
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return logs;
    return logs.filter((row) =>
      [row.action, row.entity_type, row.entity_id, row.actor_id]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle)),
    );
  }, [logs, query]);

  async function download() {
    setError(null);
    try {
      const blob = await api.downloadAdminAuditLogs();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "clearpath-audit-logs.csv";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(apiErrorMessage(cause, "ส่งออก audit log ไม่สำเร็จ"));
    }
  }

  return (
    <article className="cp-admin-table-card">
      <div className="cp-admin-card-heading">
        <div>
          <h3>ประวัติการดำเนินงาน</h3>
          <p>ค้นหา actor/action/entity และส่งออก CSV สำหรับ incident review</p>
        </div>
        <button
          type="button"
          className="cp-admin-button"
          onClick={() => void download()}
        >
          ส่งออก CSV
        </button>
      </div>
      <label className="cp-admin-audit-search">
        ค้นหาประวัติ
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="เช่น announcement_updated"
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <div className="cp-admin-table-wrap">
        <table>
          <caption>Audit log ล่าสุด</caption>
          <thead>
            <tr>
              <th>เวลา</th>
              <th>การทำงาน</th>
              <th>ข้อมูล</th>
              <th>ผู้ดำเนินการ</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.id}>
                <td>{formatDate(row.created_at)}</td>
                <td>{row.action}</td>
                <td>
                  {row.entity_type} · {row.entity_id ?? "—"}
                </td>
                <td>{row.actor_id ?? "system"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!filtered.length && (
        <div className="cp-admin-empty">ไม่พบประวัติที่ค้นหา</div>
      )}
      {hasMore && !query.trim() && (
        <button
          type="button"
          className="cp-admin-button cp-admin-button--secondary cp-focus"
          disabled={loadingMore}
          onClick={() => void onLoadMore()}
        >
          {loadingMore ? "กำลังโหลด…" : "โหลดประวัติเพิ่ม"}
        </button>
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
