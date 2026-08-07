"use client";

import { useState } from "react";

import type {
  FalseSafeDisposition,
  ForecastFalseSafeCase,
  ForecastFalseSafeReviewRequest,
} from "@/frontend/types/ui";

const DISPOSITIONS: Array<{
  value: FalseSafeDisposition;
  label: string;
}> = [
  { value: "model_issue", label: "ปัญหาจากโมเดล" },
  { value: "source_data_issue", label: "ข้อมูลต้นทางผิดปกติ" },
  { value: "expected_edge_case", label: "กรณีขอบที่คาดไว้" },
  { value: "safety_incident", label: "เหตุการณ์กระทบความปลอดภัย" },
];

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString("th-TH", {
        dateStyle: "medium",
        timeStyle: "short",
      });
}

export default function FalseSafeCaseReviewList({
  rows,
  onReview,
}: {
  rows: ForecastFalseSafeCase[];
  onReview: (
    row: ForecastFalseSafeCase,
    body: ForecastFalseSafeReviewRequest,
  ) => Promise<void>;
}) {
  const [drafts, setDrafts] = useState<
    Record<string, ForecastFalseSafeReviewRequest>
  >({});
  const [saving, setSaving] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, string>>({});

  return (
    <div className="cp-admin-review-list">
      {rows.map((row) => {
        const key = `${row.run_id}:${row.horizon_hours}:${row.variant}`;
        const current = row.forecast_false_safe_reviews?.[0];
        const draft = drafts[key] ?? {
          disposition: current?.disposition ?? "model_issue",
          note: current?.note ?? "",
        };
        return (
          <form
            className="cp-admin-review-card"
            key={key}
            onSubmit={async (event) => {
              event.preventDefault();
              if (draft.note.trim().length < 10) {
                setFeedback((value) => ({
                  ...value,
                  [key]: "กรุณาระบุเหตุผลอย่างน้อย 10 ตัวอักษร",
                }));
                return;
              }
              setSaving(key);
              setFeedback((value) => ({ ...value, [key]: "" }));
              try {
                await onReview(row, { ...draft, note: draft.note.trim() });
                setFeedback((value) => ({
                  ...value,
                  [key]: "บันทึกผลตรวจแล้ว",
                }));
              } catch {
                setFeedback((value) => ({
                  ...value,
                  [key]: "บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง",
                }));
              } finally {
                setSaving(null);
              }
            }}
          >
            <div className="cp-admin-review-card__summary">
              <div>
                <strong>
                  {row.forecast_runs.station_id} · {row.horizon_hours}h ·{" "}
                  {row.variant}
                </strong>
                <small>
                  {row.forecast_runs.district ?? "ไม่ทราบอำเภอ"} ·{" "}
                  {formatDate(row.forecast_at)}
                </small>
              </div>
              <span className="cp-admin-status" data-status="failed">
                false-safe
              </span>
            </div>
            <dl className="cp-admin-review-metrics">
              <div>
                <dt>พยากรณ์</dt>
                <dd>{row.pm25.toFixed(1)} µg/m³</dd>
              </div>
              <div>
                <dt>ค่าจริง</dt>
                <dd>{row.observed_pm25.toFixed(1)} µg/m³</dd>
              </div>
              <div>
                <dt>คลาดเคลื่อน</dt>
                <dd>{row.absolute_error.toFixed(1)} µg/m³</dd>
              </div>
            </dl>
            <label>
              <span>จัดประเภทสาเหตุ</span>
              <select
                className="cp-focus"
                value={draft.disposition}
                onChange={(event) =>
                  setDrafts((value) => ({
                    ...value,
                    [key]: {
                      ...draft,
                      disposition: event.target.value as FalseSafeDisposition,
                    },
                  }))
                }
              >
                {DISPOSITIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>หลักฐานและเหตุผล</span>
              <textarea
                className="cp-focus"
                minLength={10}
                maxLength={1000}
                required
                rows={3}
                value={draft.note}
                onChange={(event) =>
                  setDrafts((value) => ({
                    ...value,
                    [key]: { ...draft, note: event.target.value },
                  }))
                }
                placeholder="อธิบายข้อมูลต้นทาง สภาพอากาศ และผลกระทบที่ตรวจพบ"
              />
            </label>
            <div className="cp-admin-review-card__actions">
              <span role="status">{feedback[key]}</span>
              <button
                type="submit"
                className="cp-admin-button cp-focus"
                disabled={saving === key}
              >
                {saving === key
                  ? "กำลังบันทึก…"
                  : current
                    ? "อัปเดตผลตรวจ"
                    : "บันทึกผลตรวจ"}
              </button>
            </div>
          </form>
        );
      })}
    </div>
  );
}
