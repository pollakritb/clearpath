"use client";
import { useEffect, useRef, useState } from "react";
import { api, apiErrorMessage } from "@/frontend/lib/api-client";
import {
  readPrivateDraft,
  writePrivateDraft,
  removePrivateDraft,
  privateDraftGeneration,
} from "@/frontend/lib/private-draft-memory";
import { useAuth } from "@/frontend/components/auth/AuthProvider";
import { useLoginPrompt } from "@/frontend/components/auth/LoginPromptProvider";
import { googleReporterProfile } from "@/frontend/lib/reporter-profile";
import type { CameraEvidence } from "@/frontend/components/panels/CameraCapture";
import type { ReportLocation } from "@/frontend/types/ui";
import type {
  ReportCreateResponse,
  ReportDraftResponse,
} from "@/frontend/types";
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

interface PrivateReportDraft {
  evidence: CameraEvidence | null;
  draft: ReportDraftResponse | null;
  claimedPm25: string;
  hideIdentity: boolean;
  measurementEnvironment: "unknown" | "outdoor" | "indoor";
  averagingPeriod: "unknown" | "instant" | "1_minute" | "5_minutes";
  deviceModel: string;
  nearEmissionSource: boolean;
}

export function useReportDraft({
  location,
  locationError,
  measurementRequestId,
  onRequestLocation,
  onSubmitted,
}: {
  location: ReportLocation | null;
  locationError?: string | null;
  measurementRequestId?: string;
  onRequestLocation: () => void;
  onSubmitted: () => void;
}) {
  const auth = useAuth();
  const owner = auth.user?.id ?? (auth.localDemo ? "local" : "guest");
  const draftKey = JSON.stringify([owner, measurementRequestId ?? "report"]);
  const [restored] = useState(() =>
    owner === "guest" ? null : readPrivateDraft<PrivateReportDraft>(draftKey),
  );
  const generation = useRef(privateDraftGeneration());
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const isCurrent = () =>
    alive.current && generation.current === privateDraftGeneration();
  const [evidence, setEvidence] = useState<CameraEvidence | null>(
    restored?.evidence ?? null,
  );
  const analysisEvidence = useRef<CameraEvidence | null>(
    restored?.draft ? restored.evidence : null,
  );
  const [draft, setDraft] = useState<ReportDraftResponse | null>(
    restored?.draft ?? null,
  );
  const [claimedPm25, setClaimedPm25] = useState(restored?.claimedPm25 ?? "");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState<ReportCreateResponse | null>(null);
  const [hideIdentity, setHideIdentity] = useState(
    restored?.hideIdentity ?? false,
  );
  const [measurementEnvironment, setMeasurementEnvironment] = useState<
    "unknown" | "outdoor" | "indoor"
  >(restored?.measurementEnvironment ?? "unknown");
  const [averagingPeriod, setAveragingPeriod] = useState<
    "unknown" | "instant" | "1_minute" | "5_minutes"
  >(restored?.averagingPeriod ?? "unknown");
  const [deviceModel, setDeviceModel] = useState(restored?.deviceModel ?? "");
  const [nearEmissionSource, setNearEmissionSource] = useState(
    restored?.nearEmissionSource ?? false,
  );
  const googleProfile = googleReporterProfile(auth.user);
  const [participation, setParticipation] = useState<{
    owner: string;
    alias: string;
    supportsContext: boolean;
  } | null>(null);
  const publicAlias =
    participation?.owner === owner ? participation.alias : null;
  useEffect(() => {
    if (owner === "guest" || !api.xpSummary) return;
    let active = true;
    void api
      .xpSummary()
      .then((profile) => {
        if (active && profile)
          setParticipation({
            owner,
            alias: profile.alias,
            supportsContext: ["contribution-v2", "contribution-v3"].includes(
              profile.policy_version ?? "",
            ),
          });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [owner]);
  useEffect(() => {
    if (owner === "guest" || generation.current !== privateDraftGeneration())
      return;
    if ((!evidence && !draft) || completed) {
      removePrivateDraft(draftKey);
      return;
    }
    const deadline = draft?.expires_at
      ? Date.parse(draft.expires_at)
      : Infinity;
    writePrivateDraft<PrivateReportDraft>(
      draftKey,
      {
        evidence,
        draft,
        claimedPm25,
        hideIdentity,
        measurementEnvironment,
        averagingPeriod,
        deviceModel,
        nearEmissionSource,
      },
      Math.min(
        Date.now() + 30 * 60_000,
        Number.isFinite(deadline) ? deadline : Infinity,
      ),
    );
  }, [
    owner,
    draftKey,
    evidence,
    draft,
    claimedPm25,
    hideIdentity,
    measurementEnvironment,
    averagingPeriod,
    deviceModel,
    nearEmissionSource,
    completed,
  ]);
  useEffect(() => {
    if (!evidence && !draft) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [evidence, draft]);
  const needsRestoredLocation = useRef(
    Boolean(restored?.evidence && !restored.draft),
  );
  useEffect(() => {
    if (needsRestoredLocation.current) {
      needsRestoredLocation.current = false;
      onRequestLocation();
    }
  }, [onRequestLocation]);
  async function discardDraft() {
    if (sending) return;
    setError(null);
    if (draft) {
      try {
        await api.deleteReportDraft(draft.id);
        if (!isCurrent()) return;
      } catch (cause) {
        if (isCurrent())
          setError(
            apiErrorMessage(cause, "ทิ้งร่างไม่สำเร็จ กรุณาลองอีกครั้ง"),
          );
        return;
      }
    }
    analysisEvidence.current = null;
    setEvidence(null);
    setDraft(null);
    setClaimedPm25("");
    setMessage(null);
    removePrivateDraft(draftKey);
  }
  const loginPrompt = useLoginPrompt();
  const activeStep = draft ? 3 : evidence ? 2 : 1;

  const [analysisAttempt, setAnalysisAttempt] = useState(0);
  const hasGps = location?.source === "gps";
  const locationIssue =
    locationError ||
    (hasGps && (location?.accuracy ?? Infinity) > 200
      ? "ตำแหน่งคลาดเคลื่อนเกิน 200 เมตร กรุณาขอตำแหน่งใหม่ก่อนอ่านภาพ"
      : null);
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
      if (!isCurrent()) return;
      setDraft(null);
      setEvidence(null);
      setClaimedPm25("");
      setMessage(null);
    } catch (cause) {
      if (isCurrent())
        setError(apiErrorMessage(cause, "เริ่มถ่ายภาพใหม่ไม่สำเร็จ"));
    } finally {
      if (isCurrent()) setSending(false);
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
            apiErrorMessage(
              cause,
              "อ่านภาพไม่สำเร็จ กรุณาลองอีกครั้ง ภาพที่เลือกยังอยู่",
            ),
          );
      } finally {
        if (analysisEvidence.current === evidence) setSending(false);
      }
    })();
  }, [evidence, location, auth.user, auth.localDemo, analysisAttempt]);

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
      const automaticHelp = !measurementRequestId
        ? await api
            .measurementHelper()
            .then((settings) => settings.registered_locations_enabled)
            .catch(() => false)
        : false;
      const bonusGPS =
        (measurementRequestId ||
          automaticHelp ||
          participation?.supportsContext) &&
        navigator.geolocation
          ? await new Promise<{
              lat: number;
              lon: number;
              accuracy_m: number;
            } | null>((resolve) =>
              navigator.geolocation.getCurrentPosition(
                (position) =>
                  resolve(
                    position.coords.accuracy <= 200
                      ? {
                          lat: position.coords.latitude,
                          lon: position.coords.longitude,
                          accuracy_m: position.coords.accuracy,
                        }
                      : null,
                  ),
                () => resolve(null),
                { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 },
              ),
            )
          : null;
      if (!isCurrent()) return;
      const result = await api.submitReportDraft(draft.id, {
        bonus_gps: bonusGPS,
        user_claimed_pm25: Number(claimedPm25),
        ...(measurementRequestId
          ? { measurement_request_id: measurementRequestId }
          : {}),
        ...(participation?.supportsContext
          ? {
              measurement_environment: measurementEnvironment,
              device_model: deviceModel.trim() || null,
              near_emission_source: nearEmissionSource,
              averaging_period: averagingPeriod,
            }
          : {}),
        hide_identity: hideIdentity,
        measurement_stable: false,
        measurement_duration_seconds: 0,
      });
      if (!isCurrent()) return;
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
      if (isCurrent()) setError(apiErrorMessage(cause, "ส่งรายงานไม่สำเร็จ"));
    } finally {
      if (isCurrent()) setSending(false);
    }
  }

  function captureEvidence(nextEvidence: CameraEvidence) {
    generation.current = privateDraftGeneration();
    analysisEvidence.current = null;
    setDraft(null);
    setClaimedPm25("");
    setEvidence(nextEvidence);
    setMessage(null);
    onRequestLocation();
  }
  function clearEvidence() {
    analysisEvidence.current = null;
    setSending(false);
    setDraft(null);
    setClaimedPm25("");
    setEvidence(null);
  }
  function retryAnalysis() {
    analysisEvidence.current = null;
    setAnalysisAttempt((attempt) => attempt + 1);
  }
  const ocrStatusMessage = draft ? OCR_STATUS_MESSAGES[draft.ocr_status] : "";
  return {
    captureEvidence,
    clearEvidence,
    retryAnalysis,
    ocrStatusMessage,
    auth,
    restored,
    evidence,
    draft,
    setClaimedPm25,
    sending,
    message,
    setMessage,
    error,
    setError,
    completed,
    setCompleted,
    hideIdentity,
    setHideIdentity,
    measurementEnvironment,
    setMeasurementEnvironment,
    averagingPeriod,
    setAveragingPeriod,
    deviceModel,
    setDeviceModel,
    nearEmissionSource,
    setNearEmissionSource,
    googleProfile,
    participation,
    publicAlias,
    discardDraft,
    loginPrompt,
    activeStep,
    hasGps,
    locationIssue,
    canSubmit,
    retakePhoto,
    submit,
  };
}
