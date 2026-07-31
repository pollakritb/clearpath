"use client";

import { useCallback, useEffect, useState } from "react";

import { api, apiErrorMessage } from "@/frontend/lib/api-client";
import type { CommunityReport, ModerationRequest } from "@/frontend/types";

import AdminReportCard from "./admin/AdminReportCard";

export default function AdminPanel({
  onChanged,
  onQueueCountChange,
}: {
  onChanged: () => void;
  onQueueCountChange?: (count: number) => void;
}) {
  const [reports, setReports] = useState<CommunityReport[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.adminReports();
      setReports(result.reports);
      onQueueCountChange?.(result.count);
    } catch (cause) {
      setError(apiErrorMessage(cause, "เปิดคิวตรวจสอบไม่สำเร็จ"));
    } finally {
      setLoading(false);
    }
  }, [onQueueCountChange]);

  useEffect(() => {
    let cancelled = false;
    void api
      .adminReports()
      .then((result) => {
        if (cancelled) return;
        setReports(result.reports);
        onQueueCountChange?.(result.count);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(apiErrorMessage(cause, "เปิดคิวตรวจสอบไม่สำเร็จ"));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [onQueueCountChange]);

  async function decide(reportId: string, body: ModerationRequest) {
    setSavingId(reportId);
    setError(null);
    try {
      await api.moderateReport(reportId, body);
      await loadQueue();
      onChanged();
    } catch (cause) {
      setError(apiErrorMessage(cause, "บันทึกผลตรวจไม่สำเร็จ"));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <section className="cp-admin-panel">
      <div className="cp-admin-section-heading">
        <div>
          <span className="cp-eyebrow">Exception review queue</span>
          <h2>ตรวจเฉพาะหลักฐานที่ไม่ผ่านเกณฑ์อัตโนมัติ</h2>
          <p>
            ระบบอนุมัติเคสมั่นใจสูงไปแล้ว คิวนี้ใช้สำหรับภาพไม่ชัด ค่าไม่ตรง
            หรือสัญญาณคุณภาพไม่ครบ
          </p>
        </div>
        <button
          type="button"
          onClick={loadQueue}
          disabled={loading}
          className="cp-admin-button cp-focus"
        >
          {loading ? "กำลังโหลด…" : "รีเฟรชคิว"}
        </button>
      </div>
      {error && (
        <p role="alert" style={{ fontSize: ".72em", color: "#c2433a" }}>
          {error}
        </p>
      )}
      <div className="cp-admin-report-grid">
        {reports.map((report) => (
          <AdminReportCard
            key={report.id}
            report={report}
            saving={savingId === report.id}
            onDecision={decide}
          />
        ))}
      </div>
      {!loading && reports.length === 0 && (
        <div className="cp-admin-empty">
          <strong>ไม่มีเคสผิดปกติรอตรวจ</strong>
          <span>รายงานที่ผ่านเกณฑ์สูงจะได้รับการอนุมัติอัตโนมัติ</span>
        </div>
      )}
    </section>
  );
}
