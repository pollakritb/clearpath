"use client";

import { useEffect, useRef, useState } from "react";

import { api, apiErrorMessage } from "@/frontend/lib/api-client";
import { useAuth } from "@/frontend/components/auth/AuthProvider";
import { useLoginPrompt } from "@/frontend/components/auth/LoginPromptProvider";
import AppIcon from "@/frontend/components/ui/AppIcon";
import SourceBadge from "@/frontend/components/ui/SourceBadge";
import { T } from "@/frontend/lib/ui";
import { googleReporterProfile } from "@/frontend/lib/reporter-profile";
import type { ReportLocation } from "@/frontend/types/ui";
import type {
  ReportCreateResponse,
  ReportDraftResponse,
} from "@/frontend/types";

import CameraCapture, { type CameraEvidence } from "./CameraCapture";
import LocationCard from "./report/LocationCard";

interface ReportFormProps {
  location: ReportLocation | null;
  locationError?: string | null;
  onRequestLocation: () => void;
  onSubmitted: () => void;
}

const OCR_STATUS_MESSAGES: Record<ReportDraftResponse["ocr_status"], string> = {
  unavailable: "ระบบอ่านภาพอัตโนมัติยังไม่พร้อม กรุณาลองถ่ายภาพใหม่ก่อนส่ง",
  service_error: "ระบบอ่านภาพขัดข้องชั่วคราว กรุณารอสักครู่แล้วลองถ่ายภาพใหม่",
  no_device:
    "ระบบไม่พบเครื่องวัดในภาพ กรุณาจัดเครื่องวัดให้อยู่กลางภาพแล้วถ่ายใหม่",
  unclear_display:
    "หน้าจอในภาพยังไม่ชัด กรุณาเช็ดหน้าจอ ลดแสงสะท้อน แล้วถ่ายใหม่",
  no_reading: "ระบบอ่านตัวเลข PM2.5 ไม่ได้ กรุณาถ่ายภาพใหม่ให้เห็นตัวเลขชัดเจน",
  low_confidence: "ระบบอ่านตัวเลข PM2.5 ไม่ได้ชัดเจน กรุณาถ่ายภาพใหม่",
  ready: "ระบบอ่านตัวเลข PM2.5 ได้ และจะเผยแพร่ค่านี้เมื่อส่งรายงาน",
};

export default function ReportForm({
  location,
  locationError,
  onRequestLocation,
  onSubmitted,
}: ReportFormProps) {
  const [evidence, setEvidence] = useState<CameraEvidence | null>(null);
  const analysisEvidence = useRef<CameraEvidence | null>(null);
  const [draft, setDraft] = useState<ReportDraftResponse | null>(null);
  const [claimedPm25, setClaimedPm25] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState<ReportCreateResponse | null>(null);
  const [hideIdentity, setHideIdentity] = useState(false);
  const auth = useAuth();
  const reporterProfile = googleReporterProfile(auth.user);
  const loginPrompt = useLoginPrompt();
  const activeStep = draft ? 3 : evidence ? 2 : 1;

  const hasGps = location?.source === "gps";
  const canSubmit = Boolean(
    draft &&
    draft.ocr_pm25 != null &&
    Number.isFinite(Number(claimedPm25)) &&
    Number(claimedPm25) >= 0 &&
    Number(claimedPm25) <= 1000 &&
    !sending &&
    (auth.user || auth.localDemo),
  );

  async function retakePhoto() {
    if (!draft || sending) return;
    setSending(true);
    setError(null);
    try {
      await api.deleteReportDraft(draft.id);
      setDraft(null);
      setEvidence(null);
      setClaimedPm25("");
      setMessage(null);
    } catch (cause) {
      setError(apiErrorMessage(cause, "เริ่มถ่ายภาพใหม่ไม่สำเร็จ"));
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    if (
      !evidence ||
      !location ||
      location.source !== "gps" ||
      (location.accuracy ?? Infinity) > 200 ||
      (!auth.user && !auth.localDemo) ||
      analysisEvidence.current === evidence
    )
      return;
    analysisEvidence.current = evidence;
    setSending(true);
    setError(null);
    void (async () => {
      try {
        const form = new FormData();
        form.set("lat", String(evidence.measuredLocation?.lat ?? location.lat));
        form.set("lon", String(evidence.measuredLocation?.lon ?? location.lon));
        form.set("submission_lat", String(location.lat));
        form.set("submission_lon", String(location.lon));
        form.set("gps_accuracy_m", String(location.accuracy));
        form.set("camera_session_token", evidence.sessionToken);
        form.set("client_captured_at", evidence.capturedAt);
        form.set("capture_source", evidence.source ?? "camera");
        if (evidence.timezoneOffsetMinutes != null)
          form.set(
            "client_timezone_offset_minutes",
            String(evidence.timezoneOffsetMinutes),
          );
        if (evidence.selectedAt)
          form.set("file_selected_at", evidence.selectedAt);
        form.set(
          "file_last_modified_at",
          evidence.fileLastModifiedAt ??
            new Date(evidence.file.lastModified).toISOString(),
        );
        form.set("image", evidence.file);
        evidence.burstFiles.forEach((file) =>
          form.append("burst_images", file),
        );
        const nextDraft = await api.createReportDraft(form);
        if (analysisEvidence.current !== evidence) return;
        setDraft(nextDraft);
        setClaimedPm25(
          nextDraft.ocr_pm25 == null ? "" : String(nextDraft.ocr_pm25),
        );
        setMessage(
          `เวลาที่วัด ${new Date(nextDraft.captured_at).toLocaleString("th-TH")} · ` +
            `${OCR_STATUS_MESSAGES[nextDraft.ocr_status]}` +
            (nextDraft.ocr_pm25 == null
              ? ""
              : ` ค่าที่อ่านได้ ${nextDraft.ocr_pm25} µg/m³`),
        );
      } catch (cause) {
        if (analysisEvidence.current === evidence)
          setError(
            apiErrorMessage(cause, "อ่านภาพไม่สำเร็จ กรุณาเลือกภาพใหม่"),
          );
      } finally {
        if (analysisEvidence.current === evidence) setSending(false);
      }
    })();
  }, [evidence, location, auth.user, auth.localDemo]);

  useEffect(
    () => () => {
      analysisEvidence.current = null;
    },
    [],
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!draft || !canSubmit) return;
    setSending(true);
    setError(null);
    setMessage(null);
    try {
      if (!canSubmit) return;
      const result = await api.submitReportDraft(draft.id, {
        user_claimed_pm25: Number(claimedPm25),
        hide_identity: hideIdentity,
        measurement_stable: false,
        measurement_duration_seconds: 0,
      });
      setMessage(
        result.message +
          (result.review_outcome === "automatic_approved"
            ? ` · เผยแพร่ ${result.report.verified_pm25 ?? "—"} µg/m³ แล้ว`
            : " · ไม่เผยแพร่ กรุณาตรวจเหตุผลและถ่ายภาพใหม่"),
      );
      setCompleted(result);
      setHideIdentity(false);
      setEvidence(null);
      setDraft(null);
      setClaimedPm25("");
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
          <h2>
            {approved
              ? "รายงานผ่านการตรวจอัตโนมัติ"
              : "รายงานไม่ผ่านการตรวจอัตโนมัติ"}
          </h2>
          <p>
            {approved
              ? "ข้อมูลที่ผ่านเกณฑ์ถูกเผยแพร่ตามนโยบายของ ClearPath แล้ว"
              : "ข้อมูลนี้ไม่ถูกเผยแพร่บนแผนที่ กรุณาตรวจเหตุผลแล้วถ่ายภาพใหม่"}
          </p>
          <div className="cp-report-success__reading">
            <strong>
              {completed.report.verified_pm25 ??
                completed.report.user_claimed_pm25}
            </strong>
            <span>
              µg/m³ PM2.5{approved ? "" : " · ค่าที่ส่ง (ไม่เผยแพร่)"}
            </span>
          </div>
          {!approved && completed.review_reasons.length > 0 ? (
            <div className="cp-report-success__reasons" role="alert">
              <strong>เหตุผลที่ไม่ผ่าน</strong>
              <ul>
                {completed.review_reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <dl className="cp-report-success__meta">
            <div>
              <dt>สถานะ</dt>
              <dd>{approved ? "เผยแพร่แล้ว" : "ไม่ผ่านเกณฑ์"}</dd>
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
              ? "กำลังอ่านข้อมูลอัตโนมัติ"
              : "เพิ่มภาพเครื่องวัด"}
        </h2>
        <p>
          {draft
            ? "ตรวจข้อมูลที่ระบบอ่านได้แล้วกดส่งรายงาน"
            : evidence
              ? "เปิด GPS เพื่อบันทึกตำแหน่งขณะส่ง แยกจากตำแหน่งที่วัด"
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
        </div>
      </details>
      <ol className="cp-report-progress" aria-label="ขั้นตอนส่งข้อมูล">
        <li data-complete={Boolean(evidence)}>
          <b>
            <AppIcon name="camera" size={17} />
          </b>
          <span>เพิ่มภาพ</span>
        </li>
        <li data-complete={hasGps}>
          <b>
            <AppIcon name="location" size={17} />
          </b>
          <span>อ่านข้อมูลอัตโนมัติ</span>
        </li>
        <li data-complete={Boolean(draft)}>
          <b>
            <AppIcon name="check" size={17} />
          </b>
          <span>ตรวจและส่ง</span>
        </li>
      </ol>
      {!auth.user && !auth.localDemo && (
        <aside className="cp-auth-redirect" aria-label="ต้องเข้าสู่ระบบ">
          <span>
            <strong>เข้าสู่ระบบก่อนส่งข้อมูล</strong>
            <small>จัดการบัญชี Google ได้จากหน้าการตั้งค่าเพียงจุดเดียว</small>
          </span>
          <button
            type="button"
            className="cp-focus"
            onClick={() =>
              loginPrompt.openLoginPrompt({
                title: "เข้าสู่ระบบก่อนส่งข้อมูล",
                description:
                  "ใช้บัญชี Google เพื่อยืนยันผู้ส่ง ป้องกันสแปม และติดตามสถานะรายงาน",
              })
            }
          >
            เข้าสู่ระบบด้วย Google
          </button>
        </aside>
      )}
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
                <strong>ภาพหน้าจอเครื่องวัด</strong>
                <small>ถ่ายใหม่หรือเลือกจากคลัง ให้เห็นตัวเลขชัดเจน</small>
              </span>
            </div>
            <CameraCapture
              onLoginRequired={() =>
                loginPrompt.openLoginPrompt({
                  title: "เข้าสู่ระบบก่อนเพิ่มภาพ",
                  description:
                    "ใช้บัญชี Google เพื่อยืนยันผู้ส่งและติดตามผลการตรวจรายงาน",
                })
              }
              onCaptured={(nextEvidence) => {
                analysisEvidence.current = null;
                setDraft(null);
                setClaimedPm25("");
                setEvidence(nextEvidence);
                setMessage(null);
                onRequestLocation();
              }}
              onCleared={() => {
                analysisEvidence.current = null;
                setSending(false);
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
                <strong>GPS ขณะส่ง</strong>
                <small>บันทึกจากอุปกรณ์ แยกจากตำแหน่งที่วัดในภาพ</small>
              </span>
            </div>
            <LocationCard
              location={location}
              onRequestLocation={onRequestLocation}
            />
            {locationError && <p role="alert">{locationError}</p>}
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
                <small>ระบบอ่านข้อมูลจากภาพให้อัตโนมัติ</small>
              </span>
            </div>
            {draft.ocr_pm25 == null ? (
              <div className="cp-report-ocr-retry" role="alert">
                <strong>ยังอ่านตัวเลข PM2.5 ไม่ได้</strong>
                <p>{OCR_STATUS_MESSAGES[draft.ocr_status]}</p>
                <button
                  type="button"
                  className="cp-focus"
                  disabled={sending}
                  onClick={retakePhoto}
                >
                  <AppIcon name="camera" size={18} />
                  {sending ? "กำลังเตรียม…" : "เปลี่ยนภาพ"}
                </button>
              </div>
            ) : (
              <div className="cp-report-fields">
                <div aria-label="ค่าฝุ่นที่อ่านจากภาพ">
                  <strong>PM2.5 {draft.ocr_pm25} µg/m³</strong>
                  <p>ระบบจะเผยแพร่ค่าที่อ่านจากภาพโดยอัตโนมัติ</p>
                  <p>
                    เวลาที่วัด{" "}
                    {new Date(draft.captured_at).toLocaleString("th-TH")}
                  </p>
                  {evidence?.measuredLocation && (
                    <p>
                      ตำแหน่งจากภาพ {evidence.measuredLocation.lat.toFixed(5)},{" "}
                      {evidence.measuredLocation.lon.toFixed(5)}
                    </p>
                  )}
                </div>
                <div
                  className="cp-report-identity-choice"
                  data-hidden={hideIdentity}
                >
                  <div className="cp-report-identity-choice__preview">
                    <span aria-hidden>
                      <AppIcon name="user" size={21} />
                    </span>
                    <div>
                      <strong>
                        {hideIdentity
                          ? "ไม่เปิดเผยตัวตน"
                          : (reporterProfile?.displayName ??
                            "แสดงโปรไฟล์ผู้รายงาน")}
                      </strong>
                      <small>
                        {hideIdentity
                          ? "ชื่อและรูปโปรไฟล์จะไม่แสดงในรายงานนี้"
                          : reporterProfile
                            ? "ชื่อและรูปโปรไฟล์ Google จะแสดงในรายงานนี้"
                            : "บัญชีนี้ยังไม่มีโปรไฟล์ Google ที่แสดงได้"}
                      </small>
                    </div>
                  </div>
                  <label>
                    <input
                      type="checkbox"
                      checked={hideIdentity}
                      disabled={sending}
                      onChange={(event) =>
                        setHideIdentity(event.target.checked)
                      }
                    />
                    <span>ปิดบังตัวตนในรายงานนี้</span>
                  </label>
                </div>
              </div>
            )}
          </div>
        )}
        {draft && draft.ocr_pm25 != null && (
          <button
            type="submit"
            disabled={!canSubmit}
            className="cp-report-submit cp-focus"
            style={{
              minHeight: "48px",
              border: "none",
              borderRadius: "11px",
              background: canSubmit ? T.brandGrad : "#bcc7c4",
              color: "#fff",
              fontFamily: "inherit",
              fontWeight: 800,
              cursor: sending ? "wait" : "pointer",
            }}
          >
            {sending ? "กำลังส่งรายงาน…" : "ส่งรายงาน"}
          </button>
        )}
        {evidence && !draft && (
          <p role="status">
            {sending
              ? "กำลังอ่านค่า PM2.5 จากภาพ…"
              : hasGps
                ? "กรุณาเปลี่ยนภาพหากอ่านข้อมูลไม่สำเร็จ"
                : "กำลังรับตำแหน่ง GPS จากอุปกรณ์…"}
          </p>
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
          ระบบเก็บภาพต้นฉบับ ข้อมูลเวลาและไฟล์ ตำแหน่งที่วัด และ GPS
          ขณะส่งไว้เป็นหลักฐานส่วนตัวสำหรับผู้ดูแล ตำแหน่งสาธารณะจะเลื่อนประมาณ
          120–250 เมตรเพื่อปกป้องความเป็นส่วนตัว
          ภาพของรายงานที่ผ่านจะแสดงผ่านลิงก์ชั่วคราว
          โดยลบข้อมูลเวลาและพิกัดที่ฝังอยู่ในไฟล์ออกก่อน
        </p>
      </details>
    </section>
  );
}
