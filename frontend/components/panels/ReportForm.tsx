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
          nextDraft.ocr_pm25 == null
            ? "OCR อ่านค่าไม่ได้ กรุณากรอกค่าที่เห็นบนเครื่องก่อนส่ง"
            : `OCR อ่านได้ ${nextDraft.ocr_pm25} µg/m³ กรุณาตรวจและแก้ไขให้ตรงกับหน้าจอ`,
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
          (result.ocr_available
            ? " · OCR ส่งค่าช่วย Admin แล้ว"
            : " · Admin จะอ่านค่าจากภาพโดยตรง"),
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
    <section aria-label="ส่งรายงาน PM2.5 จากชุมชน">
      <h2 style={{ margin: "0 0 .25em", fontSize: "1em" }}>รายงานค่าฝุ่น</h2>
      <p style={{ margin: "0 0 .8em", fontSize: ".75em", color: T.subInk }}>
        ถ่ายหน้าจอเครื่องวัดด้วยกล้องในแอปเท่านั้น ผู้ดูแลจะอ่านและกรอกค่า PM2.5
        ก่อนเผยแพร่
      </p>
      {!auth.user && !auth.localDemo && <AuthControl />}
      <form
        onSubmit={submit}
        style={{ display: "flex", flexDirection: "column", gap: ".7em" }}
      >
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
        <LocationCard
          location={location}
          onRequestLocation={onRequestLocation}
        />
        {draft && (
          <label style={{ display: "grid", gap: ".35em", fontSize: ".78em" }}>
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
              style={{
                minHeight: "44px",
                borderRadius: "9px",
                padding: ".6em",
              }}
            />
            <small style={{ color: T.subInk }}>
              OCR เป็นเพียงคำแนะนำ ค่าเผยแพร่จริงต้องผ่านการอ่านภาพโดย Admin
            </small>
          </label>
        )}
        <DeviceFields details={details} onChange={updateDetails} />
        <button
          type="submit"
          disabled={draft ? !canSubmit : !canAnalyze}
          className="cp-focus"
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
              ? "ยืนยันค่าและส่งให้ผู้ดูแลตรวจสอบ"
              : "อ่านค่าจากภาพด้วย OCR"}
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
      <p style={{ fontSize: ".66em", color: T.subInk }}>
        ระบบเก็บ GPS จริงให้ Admin ตรวจ แต่ตำแหน่งบนแผนที่สาธารณะจะเลื่อนประมาณ
        120–250 เมตรเพื่อปกป้องความเป็นส่วนตัว
      </p>
    </section>
  );
}
