"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { api, apiErrorMessage } from "@/frontend/lib/api-client";
import type { CommunityReport } from "@/frontend/types";

import AdminReportCard from "./admin/AdminReportCard";

export default function AdminPanel() {
  const [reports, setReports] = useState<CommunityReport[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "approved" | "rejected">("all");

  const visibleReports = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return reports.filter((report) => {
      if (status !== "all" && report.status !== status) return false;
      if (!needle) return true;
      return [report.id, report.device_model, report.display_name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [query, reports, status]);

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.adminReports();
      setReports(result.reports);
    } catch (cause) {
      setError(apiErrorMessage(cause, "เปิดประวัติรายงานไม่สำเร็จ"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadReports(), 0);
    return () => window.clearTimeout(timer);
  }, [loadReports]);

  return (
    <section className="cp-admin-panel">
      <div className="cp-admin-section-heading">
        <div>
          <span className="cp-eyebrow">Automatic review log</span>
          <h2>ประวัติรายงานจากผู้ใช้</h2>
          <p>
            ระบบ OCR และกฎคุณภาพตัดสินผลอัตโนมัติทั้งหมด หน้านี้ใช้ตรวจสอบภาพ
            รายละเอียด และเหตุผลย้อนหลังเท่านั้น
          </p>
        </div>
        <button
          type="button"
          onClick={loadReports}
          disabled={loading}
          className="cp-admin-button cp-focus"
        >
          {loading ? "กำลังโหลด…" : "รีเฟรชประวัติ"}
        </button>
      </div>

      {error && (
        <p role="alert" className="cp-admin-feedback" data-error>
          {error}
        </p>
      )}

      <div className="cp-admin-report-toolbar">
        <label className="cp-admin-audit-search">
          ค้นหารายงาน
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="รหัสรายงาน รุ่นเครื่อง หรือชื่อผู้ส่ง"
          />
        </label>
        <label className="cp-admin-report-filter">
          สถานะ
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as typeof status)}
          >
            <option value="all">ทั้งหมด</option>
            <option value="approved">เผยแพร่แล้ว</option>
            <option value="rejected">ไม่ผ่านเกณฑ์</option>
          </select>
        </label>
      </div>

      <div className="cp-admin-report-grid">
        {visibleReports.map((report) => (
          <AdminReportCard key={report.id} report={report} />
        ))}
      </div>

      {!loading && reports.length === 0 && (
        <div className="cp-admin-empty">
          <strong>ยังไม่มีประวัติรายงาน</strong>
          <span>รายงานใหม่จะแสดงที่นี่หลังระบบตรวจอัตโนมัติ</span>
        </div>
      )}
      {!loading && reports.length > 0 && visibleReports.length === 0 && (
        <div className="cp-admin-empty">ไม่พบรายงานที่ค้นหา</div>
      )}
    </section>
  );
}
