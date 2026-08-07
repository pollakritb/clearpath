"use client";

import { useState } from "react";

import { api, apiErrorMessage } from "@/frontend/lib/api-client";
import AuthControl from "@/frontend/components/auth/AuthControl";
import { useAuth } from "@/frontend/components/auth/AuthProvider";
import { T } from "@/frontend/lib/ui";
import {
  EMPTY_REPORT_DETAILS,
  type ReportDetails,
  type ReportLocation,
} from "@/frontend/types/ui";
import type { ReportDraftResponse } from "@/frontend/types";

import CameraCapture, { type CameraEvidence } from "./CameraCapture";
import DeviceFields from "./report/DeviceFields";
import LocationCard from "./report/LocationCard";

interface ReportFormProps {
  location: ReportLocation | null;
  onRequestLocation: () => void;
  onSubmitted: () => void;
}

const OCR_STATUS_MESSAGES: Record<ReportDraftResponse["ocr_status"], string> = {
  unavailable:
    "ระบบอ่านภาพอัตโนมัติยังไม่เปิดใช้งาน กรุณากรอกค่าที่เห็นบนเครื่อง ระบบจะเก็บรายงานไว้ตรวจสอบ",
  service_error:
    "ระบบอ่านภาพขัดข้องชั่วคราว กรุณากรอกค่าที่เห็นบนเครื่อง รายงานจะยังไม่เผยแพร่จนกว่าจะผ่านการตรวจ",
  no_device:
    "ระบบไม่พบเครื่องวัดในภาพ กรุณาตรวจภาพและกรอกค่าที่เห็น รายงานจะถูกพักไว้เพื่อตรวจสอบ",
  unclear_display:
    "หน้าจอในภาพยังไม่ชัด กรุณากรอกค่าที่เห็น รายงานจะถูกพักไว้เพื่อตรวจสอบ",
  no_reading:
    "ระบบแยกค่า PM2.5 จากค่าอื่นไม่ได้ กรุณากรอกค่าตามหน้าจอเครื่องวัด",
  low_confidence:
    "ระบบอ่านค่าได้แต่ยังไม่มั่นใจ กรุณาเทียบกับหน้าจอและแก้ไขให้ตรงก่อนส่ง",
  ready: "ระบบอ่านค่า PM2.5 ได้ กรุณาเทียบกับหน้าจอและแก้ไขให้ตรงก่อนส่ง",
};

export default function ReportForm({
  location,
  onRequestLocation,
  onSubmitted,
}: ReportFormProps) {
  const [evidence, setEvidence] = useState<CameraEvidence | null>(null);
  const [details, setDetails] = useState<ReportDetails>(EMPTY_REPORT_DETAILS);
  const [draft, setDraft] = useState<ReportDraftResponse | null>(null);
  const [claimedPm25, setClaimedPm25] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const auth = useAuth();

  const hasGps = location?.source === "gps";
  const canAnalyze = Boolean(
    evidence &&
    hasGps &&
    (location?.accuracy ?? Number.POSITIVE_INFINITY) <= 200 &&
    !sending &&
    (auth.user || auth.localDemo),
  );
  const canSubmit = Boolean(
    draft &&
    Number.isFinite(Number(claimedPm25)) &&
    Number(claimedPm25) >= 0 &&
    Number(claimedPm25) <= 1000 &&
    details.measurementStable &&
    details.deviceModel.trim() &&
    (!details.deviceCalibrated || details.calibratedAt) &&
    !sending &&
    (auth.user || auth.localDemo),
  );

  function updateDetails(values: Partial<ReportDetails>) {
    setDetails((current) => ({ ...current, ...values }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!evidence || !location) return;

    setSending(true);
    setError(null);
    setMessage(null);

    try {
      if (!draft) {
        if (!canAnalyze) return;
        const form = new FormData();
        form.set("lat", String(location.lat));
        form.set("lon", String(location.lon));
        form.set("gps_accuracy_m", String(location.accuracy));
        form.set("camera_session_token", evidence.sessionToken);
        form.set("client_captured_at", evidence.capturedAt);
        form.set("image", evidence.file);
        evidence.burstFiles.forEach((file) =>
          form.append("burst_images", file),
        );
        const nextDraft = await api.createReportDraft(form);
        setDraft(nextDraft);
        setClaimedPm25(
          nextDraft.ocr_pm25 == null ? "" : String(nextDraft.ocr_pm25),
        );
        setMessage(
          `${OCR_STATUS_MESSAGES[nextDraft.ocr_status]}` +
            (nextDraft.ocr_pm25 == null
              ? ""
              : ` ค่าที่อ่านได้ ${nextDraft.ocr_pm25} µg/m³`),
        );
        return;
      }
      if (!canSubmit) return;
      const result = await api.submitReportDraft(draft.id, {
        user_claimed_pm25: Number(claimedPm25),
        display_name: details.displayName.trim() || null,
        device_model: details.deviceModel.trim(),
        device_calibrated: details.deviceCalibrated,
        calibrated_at: details.deviceCalibrated ? details.calibratedAt : null,
        measurement_environment: "outdoor",
        measurement_stable: true,
        near_emission_source: details.nearEmissionSource,
        measurement_note: details.measurementNote.trim() || null,
        averaging_period: details.averagingPeriod,
        measurement_duration_seconds: details.measurementDurationSeconds,
      });
      setMessage(
        `${result.message} · คะแนนเบื้องต้น ${result.report.trust_score}/100` +
          (result.review_outcome === "automatic_approved"
            ? ` · เผยแพร่ ${result.report.verified_pm25 ?? "—"} µg/m³ แล้ว`
            : result.ocr_available
              ? " · Admin จะตรวจเฉพาะเคสที่ระบบยังไม่มั่นใจ"
              : " · ระบบอ่านภาพไม่ได้ จึงส่งให้ Admin ตรวจแทน"),
      );
      setEvidence(null);
      setDraft(null);
      setClaimedPm25("");
      updateDetails({ measurementStable: false });
      onSubmitted();
    } catch (cause) {
      setError(apiErrorMessage(cause, "ส่งรายงานไม่สำเร็จ"));
    } finally {
      setSending(false);
    }
  }

  return (
    <section aria-label="ส่งรายงาน PM2.5 จากชุมชน" className="cp-report-flow">
      <div className="cp-report-intro">
        <span>ใช้เวลาประมาณ 2 นาที</span>
        <h2>เริ่มจากถ่ายภาพหน้าจอเครื่องวัด</h2>
        <p>เตรียมเครื่องวัดให้นิ่ง แล้วทำตาม 3 ขั้นตอนด้านล่าง</p>
      </div>
      <ol className="cp-report-progress" aria-label="ขั้นตอนส่งข้อมูล">
        <li data-complete={Boolean(evidence)}>
          <b>1</b>
          <span>ถ่ายภาพ</span>
        </li>
        <li data-complete={hasGps}>
          <b>2</b>
          <span>ยืนยัน GPS</span>
        </li>
        <li data-complete={Boolean(draft)}>
          <b>3</b>
          <span>ตรวจและส่ง</span>
        </li>
      </ol>
      {!auth.user && !auth.localDemo && <AuthControl />}
      <form onSubmit={submit} className="cp-report-form">
        <div className="cp-report-step-card" data-complete={Boolean(evidence)}>
          <div className="cp-report-step-card__heading">
            <b>1</b>
            <span>
              <strong>ถ่ายหน้าจอเครื่องวัด</strong>
              <small>ใช้กล้องสดให้เห็นตัวเลขชัดเจน</small>
            </span>
          </div>
          <CameraCapture
            onCaptured={(nextEvidence) => {
              if (draft) void api.deleteReportDraft(draft.id);
              setDraft(null);
              setClaimedPm25("");
              setEvidence(nextEvidence);
              setMessage(null);
              onRequestLocation();
            }}
            onCleared={() => {
              if (draft) void api.deleteReportDraft(draft.id);
              setDraft(null);
              setClaimedPm25("");
              setEvidence(null);
            }}
          />
        </div>

        <div className="cp-report-step-card" data-complete={hasGps}>
          <div className="cp-report-step-card__heading">
            <b>2</b>
            <span>
              <strong>ยืนยันตำแหน่ง</strong>
              <small>ใช้ GPS เพื่อยืนยันว่าข้อมูลมาจากพื้นที่จริง</small>
            </span>
          </div>
          <LocationCard
            location={location}
            onRequestLocation={onRequestLocation}
          />
        </div>

        {draft && (
          <div className="cp-report-step-card">
            <div className="cp-report-step-card__heading">
              <b>3</b>
              <span>
                <strong>ตรวจรายละเอียดก่อนส่ง</strong>
                <small>บอกข้อมูลเครื่องวัดเพื่อให้ระบบตรวจได้แม่นยำ</small>
              </span>
            </div>
            <div className="cp-report-fields">
              <label>
                ค่า PM2.5 ที่เห็นบนเครื่อง (µg/m³)
                <input
                  required
                  inputMode="decimal"
                  type="number"
                  min="0"
                  max="1000"
                  step="0.1"
                  value={claimedPm25}
                  onChange={(event) => setClaimedPm25(event.target.value)}
                />
                <small>ตรวจให้ตรงกับตัวเลขในภาพก่อนส่ง</small>
              </label>
              <DeviceFields details={details} onChange={updateDetails} />
            </div>
          </div>
        )}
        <button
          type="submit"
          disabled={draft ? !canSubmit : !canAnalyze}
          className="cp-report-submit cp-focus"
          style={{
            minHeight: "48px",
            border: "none",
            borderRadius: "11px",
            background: (draft ? canSubmit : canAnalyze)
              ? T.brandGrad
              : "#bcc7c4",
            color: "#fff",
            fontFamily: "inherit",
            fontWeight: 800,
            cursor: sending ? "wait" : "pointer",
          }}
        >
          {sending
            ? draft
              ? "กำลังส่งเข้าคิว…"
              : "กำลังอ่านค่าจากภาพ…"
            : draft
              ? "ส่งข้อมูลให้ระบบตรวจ"
              : "ตรวจภาพและไปต่อ"}
        </button>
      </form>

      {message && (
        <p role="status" style={{ fontSize: ".75em", color: T.teal }}>
          {message}
        </p>
      )}
      {error && (
        <p role="alert" style={{ fontSize: ".75em", color: "#c2433a" }}>
          {error}
        </p>
      )}
      <details className="cp-privacy-note">
        <summary>ข้อมูลของฉันถูกเก็บอย่างไร</summary>
        <p>
          ระบบเก็บ GPS จริงสำหรับตรวจคุณภาพและให้ผู้ดูแลดูเฉพาะเคสผิดปกติ
          ตำแหน่งสาธารณะจะเลื่อนประมาณ 120–250 เมตรเพื่อปกป้องความเป็นส่วนตัว
        </p>
      </details>
    </section>
  );
}
