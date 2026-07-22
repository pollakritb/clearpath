"use client";

import { useState } from "react";

import { T } from "@/frontend/lib/ui";
import type {
  CommunityReport,
  ModerationChecks,
  ModerationRequest,
  RejectionReason,
} from "@/frontend/types";

import { FORM_CONTROL_STYLE } from "../styles";
import ReportEvidenceSummary from "./ReportEvidenceSummary";

interface AdminReportCardProps {
  report: CommunityReport;
  saving: boolean;
  onDecision: (reportId: string, body: ModerationRequest) => Promise<void>;
}

export default function AdminReportCard({
  report,
  saving,
  onDecision,
}: AdminReportCardProps) {
  const [verifiedValue, setVerifiedValue] = useState("");
  const [note, setNote] = useState("");
  const [rejectionReason, setRejectionReason] = useState<RejectionReason | "">(
    "",
  );
  const [checks, setChecks] = useState<ModerationChecks>({
    image_clear: false,
    value_matches_display: false,
    location_plausible: false,
    no_screen_recapture_signs: false,
  });
  const [validationError, setValidationError] = useState<string | null>(null);

  async function decide(decision: "approve" | "reject") {
    const verifiedPm25 = Number(verifiedValue);
    if (
      decision === "approve" &&
      (!Number.isFinite(verifiedPm25) ||
        verifiedPm25 < 0 ||
        verifiedPm25 > 1000)
    ) {
      setValidationError(
        "กรุณาอ่านภาพและกรอกค่า PM2.5 ระหว่าง 0–1000 ก่อนอนุมัติ",
      );
      return;
    }
    if (decision === "approve" && !Object.values(checks).every(Boolean)) {
      setValidationError("กรุณาตรวจ checklist ทั้ง 4 ข้อก่อนอนุมัติ");
      return;
    }
    if (decision === "reject" && !rejectionReason) {
      setValidationError("กรุณาเลือกเหตุผลที่ปฏิเสธ");
      return;
    }
    setValidationError(null);
    await onDecision(report.id, {
      decision,
      verified_pm25: decision === "approve" ? verifiedPm25 : null,
      rejection_reason_code:
        decision === "reject" ? rejectionReason || null : null,
      checks,
      note: note.trim() || null,
    });
  }

  return (
    <article
      className="cp-admin-report-card"
      style={{
        border: `1px solid ${T.line}`,
        borderRadius: "12px",
        padding: ".75em",
        marginTop: ".7em",
      }}
    >
      <ReportEvidenceSummary report={report} />

      <fieldset
        style={{
          marginTop: ".6em",
          border: `1px solid ${T.line}`,
          borderRadius: "9px",
          padding: ".65em",
        }}
      >
        <legend style={{ fontSize: ".72em", fontWeight: 800 }}>
          Checklist ก่อนตัดสินใจ
        </legend>
        {(
          [
            ["image_clear", "ภาพและตัวเลขบนหน้าจอชัดเจน"],
            ["value_matches_display", "ค่าที่กรอกตรงกับภาพหลักฐาน"],
            ["location_plausible", "ตำแหน่ง GPS และบริบทสมเหตุผล"],
            [
              "no_screen_recapture_signs",
              "ไม่พบ moiré เงาสะท้อน หรือขอบอุปกรณ์อีกเครื่อง",
            ],
          ] as const
        ).map(([key, label]) => (
          <label
            key={key}
            style={{
              display: "flex",
              gap: ".5em",
              alignItems: "flex-start",
              margin: ".35em 0",
              fontSize: ".7em",
            }}
          >
            <input
              type="checkbox"
              checked={checks[key]}
              onChange={(event) =>
                setChecks((current) => ({
                  ...current,
                  [key]: event.target.checked,
                }))
              }
            />
            {label}
          </label>
        ))}
      </fieldset>

      <div
        style={{
          marginTop: ".45em",
          padding: ".55em",
          borderRadius: "8px",
          border: `1px solid ${report.near_emission_source ? T.red : T.line}`,
          fontSize: ".68em",
          color: T.subInk,
        }}
      >
        วิธีวัด:{" "}
        {report.measurement_environment === "outdoor" ? "กลางแจ้ง" : "ในอาคาร"}{" "}
        · {report.measurement_stable ? "รอค่าคงที่" : "ยังไม่คงที่"} ·{" "}
        {report.near_emission_source
          ? "อยู่ติดแหล่งควันโดยตรง"
          : "ไม่ระบุแหล่งควันตรงจุด"}
        {report.measurement_note && (
          <div style={{ marginTop: ".2em" }}>
            หมายเหตุ: {report.measurement_note}
          </div>
        )}
      </div>

      <label
        style={{
          display: "block",
          marginTop: ".55em",
          fontSize: ".74em",
          fontWeight: 700,
        }}
      >
        ค่า PM2.5 ที่ Admin อ่านจากภาพ
        <input
          type="number"
          min="0"
          max="1000"
          step="0.1"
          inputMode="decimal"
          value={verifiedValue}
          onChange={(event) => setVerifiedValue(event.target.value)}
          placeholder="กรอกก่อนกดอนุมัติ"
          style={{
            ...FORM_CONTROL_STYLE,
            marginTop: ".3em",
            fontFamily: T.mono,
            fontSize: "1.15em",
          }}
        />
      </label>
      <label
        style={{
          display: "block",
          marginTop: ".5em",
          fontSize: ".7em",
          fontWeight: 600,
        }}
      >
        เหตุผลเมื่อปฏิเสธ
        <select
          value={rejectionReason}
          onChange={(event) =>
            setRejectionReason(event.target.value as RejectionReason | "")
          }
          style={{ ...FORM_CONTROL_STYLE, marginTop: ".25em" }}
        >
          <option value="">เลือกเหตุผล</option>
          <option value="image_unclear">ภาพ/ตัวเลขไม่ชัด (ไม่หักคะแนน)</option>
          <option value="invalid_measurement">
            วิธีวัดไม่ครบ (ไม่หักคะแนน)
          </option>
          <option value="value_mismatch">ค่าที่กรอกไม่ตรงภาพ</option>
          <option value="suspected_screen_recapture">
            สงสัยถ่ายซ้อนหน้าจอ
          </option>
          <option value="invalid_location">ตำแหน่งไม่สมเหตุผล</option>
          <option value="duplicate">หลักฐานซ้ำ</option>
          <option value="other">อื่น ๆ</option>
        </select>
      </label>
      <label
        style={{
          display: "block",
          marginTop: ".5em",
          fontSize: ".7em",
          fontWeight: 600,
        }}
      >
        หมายเหตุการตรวจ
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={2}
          style={{
            ...FORM_CONTROL_STYLE,
            marginTop: ".25em",
            resize: "vertical",
          }}
        />
      </label>

      {validationError && (
        <p role="alert" style={{ fontSize: ".7em", color: T.red }}>
          {validationError}
        </p>
      )}
      <ul
        style={{
          margin: ".45em 0",
          paddingLeft: "1.2em",
          fontSize: ".68em",
          color: T.subInk,
        }}
      >
        {report.trust_reasons.slice(0, 5).map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
      <div className="cp-admin-decision-actions">
        <button
          type="button"
          disabled={saving}
          onClick={() => decide("approve")}
          className="cp-focus"
          style={{
            flex: 1,
            minHeight: "42px",
            border: "none",
            borderRadius: "8px",
            background: T.green,
            color: "#fff",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          อนุมัติค่าที่กรอก
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => decide("reject")}
          className="cp-focus"
          style={{
            flex: 1,
            minHeight: "42px",
            border: "none",
            borderRadius: "8px",
            background: T.red,
            color: "#fff",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          ปฏิเสธ
        </button>
      </div>
    </article>
  );
}
