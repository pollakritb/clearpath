"use client";

import { useState } from "react";

import { api, apiErrorMessage } from "@/frontend/lib/api-client";
import AuthControl from "@/frontend/components/auth/AuthControl";
import { useAuth } from "@/frontend/components/auth/AuthProvider";
import AppIcon from "@/frontend/components/ui/AppIcon";
import SourceBadge from "@/frontend/components/ui/SourceBadge";
import { T } from "@/frontend/lib/ui";
import { googleReporterProfile } from "@/frontend/lib/reporter-profile";
import {
  EMPTY_REPORT_DETAILS,
  type ReportDetails,
  type ReportLocation,
} from "@/frontend/types/ui";
import type {
  ReportCreateResponse,
  ReportDraftResponse,
} from "@/frontend/types";

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
  const [completed, setCompleted] = useState<ReportCreateResponse | null>(null);
  const auth = useAuth();
  const googleProfile = googleReporterProfile(auth.user);
  const activeStep = draft ? 3 : evidence ? 2 : 1;

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
        hide_identity: !googleProfile || details.hideIdentity,
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
      setCompleted(result);
      setEvidence(null);
      setDraft(null);
      setClaimedPm25("");
      updateDetails({ measurementStable: false, hideIdentity: true });
      onSubmitted();
    } catch (cause) {
      setError(apiErrorMessage(cause, "ส่งรายงานไม่สำเร็จ"));
    } finally {
      setSending(false);
    }
  }

  if (completed) {
    const approved = completed.review_outcome === "automatic_approved";
    return (
      <section
        aria-label="ส่งรายงานสำเร็จ"
        className="cp-report-flow cp-report-complete"
      >
        <div className="cp-report-success cp-section-enter" role="status">
          <span className="cp-report-success__icon" aria-hidden="true">
            <AppIcon name="check" size={30} />
          </span>
          <span className="cp-eyebrow">ระบบได้รับข้อมูลแล้ว</span>
          <h2>{approved ? "รายงานผ่านการตรวจอัตโนมัติ" : "ส่งรายงานแล้ว"}</h2>
          <p>
            {approved
              ? "ข้อมูลที่ผ่านเกณฑ์ถูกเผยแพร่ตามนโยบายของ ClearPath แล้ว"
              : "ระบบยังไม่มั่นใจเพียงพอ รายงานจึงอยู่ระหว่างรอผู้ดูแลตรวจ"}
          </p>
          <div className="cp-report-success__reading">
            <strong>
              {completed.report.verified_pm25 ??
                completed.report.user_claimed_pm25}
            </strong>
            <span>µg/m³ PM2.5</span>
          </div>
          <dl className="cp-report-success__meta">
            <div>
              <dt>สถานะ</dt>
              <dd>{approved ? "เผยแพร่แล้ว" : "รอตรวจสอบ"}</dd>
            </div>
            <div>
              <dt>Trust เบื้องต้น</dt>
              <dd>{completed.report.trust_score}/100</dd>
            </div>
          </dl>
          <button
            type="button"
            className="cp-report-submit cp-focus"
            onClick={() => {
              setCompleted(null);
              setMessage(null);
              setError(null);
            }}
          >
            ส่งรายงานใหม่
          </button>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label="ส่งรายงาน PM2.5 จากชุมชน"
      className="cp-report-flow"
      data-step={activeStep}
    >
      <div className="cp-report-intro">
        <span className="cp-report-intro__eyebrow">
          <AppIcon name="camera" size={16} />
          ใช้เวลาประมาณ 2 นาที
        </span>
        <h2>
          {draft
            ? "ตรวจข้อมูลก่อนส่ง"
            : evidence
              ? "ยืนยันตำแหน่งของรายงาน"
              : "ถ่ายภาพหน้าจอเครื่องวัด"}
        </h2>
        <p>
          {draft
            ? "ตรวจค่าฝุ่นและข้อมูลเครื่องวัดให้ตรงกับภาพ"
            : evidence
              ? "เปิด GPS เพื่อยืนยันว่าข้อมูลมาจากพื้นที่จริง"
              : "เตรียมเครื่องวัดให้นิ่งและให้ตัวเลขอยู่กลางภาพ"}
        </p>
      </div>
      <details className="cp-report-source-help">
        <summary className="cp-focus">
          <SourceBadge kind="individual" />
          <span>รายงานนี้จะแสดงบนแผนที่อย่างไร</span>
          <AppIcon name="chevron" size={17} />
        </summary>
        <div
          className="cp-report-source-guide"
          aria-label="ประเภทข้อมูลที่จะเผยแพร่"
        >
          <div data-source="individual">
            <SourceBadge kind="individual" />
            <small>ข้อมูลจากหน้านี้เผยแพร่เป็นรายงานของบุคคลเสมอ</small>
          </div>
          <div data-source="calibration">
            <span className="cp-report-calibration-icon">
              <AppIcon name="calibration" size={17} />
            </span>
            <small>
              การสอบเทียบช่วยเพิ่มความน่าเชื่อถือ แต่ยังเป็นรายงานบุคคล
            </small>
          </div>
        </div>
      </details>
      <ol className="cp-report-progress" aria-label="ขั้นตอนส่งข้อมูล">
        <li data-complete={Boolean(evidence)}>
          <b>
            <AppIcon name="camera" size={17} />
          </b>
          <span>ถ่ายภาพ</span>
        </li>
        <li data-complete={hasGps}>
          <b>
            <AppIcon name="location" size={17} />
          </b>
          <span>ยืนยัน GPS</span>
        </li>
        <li data-complete={Boolean(draft)}>
          <b>
            <AppIcon name="check" size={17} />
          </b>
          <span>ตรวจและส่ง</span>
        </li>
      </ol>
      <AuthControl compact />
      <form onSubmit={submit} className="cp-report-form">
        {!draft && (
          <div
            className="cp-report-step-card"
            data-complete={Boolean(evidence)}
          >
            <div className="cp-report-step-card__heading">
              <b>
                <AppIcon name="camera" size={19} />
              </b>
              <span>
                <strong>ถ่ายหน้าจอเครื่องวัด</strong>
                <small>ใช้กล้องสดให้เห็นตัวเลขชัดเจน</small>
              </span>
            </div>
            <CameraCapture
              onCaptured={(nextEvidence) => {
                setDraft(null);
                setClaimedPm25("");
                setEvidence(nextEvidence);
                setMessage(null);
                onRequestLocation();
              }}
              onCleared={() => {
                setDraft(null);
                setClaimedPm25("");
                setEvidence(null);
              }}
            />
          </div>
        )}

        {evidence && !draft && (
          <div className="cp-report-step-card" data-complete={hasGps}>
            <div className="cp-report-step-card__heading">
              <b>
                <AppIcon name="location" size={19} />
              </b>
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
        )}

        {draft && (
          <div className="cp-report-step-card">
            <div className="cp-report-step-card__heading">
              <b>
                <AppIcon name="check" size={19} />
              </b>
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
              <div
                className="cp-report-identity-choice"
                data-hidden={!googleProfile || details.hideIdentity}
              >
                <div className="cp-report-identity-choice__preview">
                  {googleProfile?.avatarUrl && !details.hideIdentity ? (
                    // The URL is restricted to HTTPS googleusercontent.com.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={googleProfile.avatarUrl}
                      alt=""
                      width={44}
                      height={44}
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span aria-hidden>
                      <AppIcon name="user" size={21} />
                    </span>
                  )}
                  <div>
                    <strong>
                      {googleProfile && !details.hideIdentity
                        ? (googleProfile.displayName ?? "โปรไฟล์ Google")
                        : "ไม่เปิดเผยตัวตน"}
                    </strong>
                    <small>
                      {googleProfile
                        ? details.hideIdentity
                          ? "ชื่อและรูป Google จะไม่แสดงบนแผนที่"
                          : "ชื่อและรูป Google จะแสดงเฉพาะรายงานนี้"
                        : "เข้าสู่ระบบด้วย Google หากต้องการแสดงโปรไฟล์"}
                    </small>
                  </div>
                </div>
                <label>
                  <input
                    type="checkbox"
                    checked={!googleProfile || details.hideIdentity}
                    disabled={!googleProfile}
                    onChange={(event) =>
                      updateDetails({ hideIdentity: event.target.checked })
                    }
                  />
                  <span>ปิดบังตัวตนในรายงานนี้</span>
                </label>
              </div>
              <DeviceFields details={details} onChange={updateDetails} />
            </div>
          </div>
        )}
        {(evidence || draft) && (
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
                ? "ยืนยันและส่งข้อมูล"
                : hasGps
                  ? "อ่านค่าจากภาพ"
                  : "รอตำแหน่ง GPS…"}
          </button>
        )}
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
