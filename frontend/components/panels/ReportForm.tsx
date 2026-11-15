"use client";
import { useReportDraft } from "@/frontend/hooks/useReportDraft";

import Link from "next/link";
import ConfirmAction from "@/frontend/components/ui/ConfirmAction";
import OcrReadingDisplay from "./report/OcrReadingDisplay";
import feedbackStyles from "./report/ReportFeedback.module.css";
import ReportXPResult from "@/frontend/components/community/ReportXPResult";

import { useAuth } from "@/frontend/components/auth/AuthProvider";
import AppIcon from "@/frontend/components/ui/AppIcon";
import { T } from "@/frontend/lib/ui";
import type { ReportLocation } from "@/frontend/types/ui";

import CameraCapture from "./CameraCapture";
import LocationCard from "./report/LocationCard";

interface ReportFormProps {
  measurementRequestId?: string;
  location: ReportLocation | null;
  locationError?: string | null;
  onRequestLocation: () => void;
  onSubmitted: () => void;
}

export default function ReportForm(props: ReportFormProps) {
  const auth = useAuth();
  const owner = auth.user?.id ?? (auth.localDemo ? "local" : "guest");
  return (
    <ReportFormContent
      key={JSON.stringify([owner, props.measurementRequestId])}
      {...props}
    />
  );
}

function ReportFormContent({
  location,
  locationError,
  measurementRequestId,
  onRequestLocation,
  onSubmitted,
}: ReportFormProps) {
  const {
    auth,
    restored,
    evidence,
    draft,
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
    captureEvidence,
    clearEvidence,
    retryAnalysis,
    ocrStatusMessage,
  } = useReportDraft({
    location,
    locationError,
    measurementRequestId,
    onRequestLocation,
    onSubmitted,
  });

  if (completed) {
    const approved = completed.review_outcome === "automatic_approved";
    const restartAction = (
      <button
        type="button"
        className={`${approved ? feedbackStyles.newReport : feedbackStyles.finish} cp-focus`}
        onClick={() => {
          setCompleted(null);
          setMessage(null);
          setError(null);
        }}
      >
        {approved ? "ส่งรายงานใหม่" : "ถ่ายภาพใหม่และลองอีกครั้ง"}
      </button>
    );
    return (
      <section
        aria-label="ส่งรายงานสำเร็จ"
        className="cp-report-flow cp-report-complete"
      >
        <div
          className="cp-report-success cp-section-enter"
          role="status"
          data-outcome={approved ? "approved" : "rejected"}
        >
          <span className="cp-report-success__icon" aria-hidden="true">
            <AppIcon name={approved ? "check" : "alert"} size={30} />
          </span>
          <p>ระบบได้รับข้อมูลแล้ว</p>
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
          {approved && (
            <ReportXPResult
              reportId={completed.report.id}
              initial={completed.xp}
            />
          )}
          <dl className="cp-report-success__meta">
            <div>
              <dt>สถานะ</dt>
              <dd>{approved ? "เผยแพร่แล้ว" : "ไม่ผ่านเกณฑ์"}</dd>
            </div>
          </dl>
          <div className={feedbackStyles.actions}>
            {!approved && restartAction}
            <Link
              href="/"
              className={`${approved ? feedbackStyles.finish : feedbackStyles.newReport} cp-focus`}
            >
              เสร็จสิ้นและกลับไปแผนที่
            </Link>
            {approved && restartAction}
          </div>
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
      {(evidence || draft) && (
        <div className="cp-report-intro">
          <span className="cp-report-intro__eyebrow">
            <AppIcon name="camera" size={16} />
            ใช้เวลาประมาณ 2 นาที
          </span>
          <h2>
            {draft
              ? "ตรวจข้อมูลก่อนส่ง"
              : sending
                ? "กำลังอ่านข้อมูลอัตโนมัติ"
                : locationIssue
                  ? "ต้องแก้ไขตำแหน่งก่อนอ่านภาพ"
                  : !hasGps
                    ? "รอตำแหน่งก่อนอ่านภาพ"
                    : "ตรวจภาพเครื่องวัด"}
          </h2>
          <p>
            {draft
              ? "ตรวจข้อมูลที่ระบบอ่านได้แล้วกดส่งรายงาน"
              : evidence
                ? "เปิด GPS เพื่อบันทึกตำแหน่งขณะส่ง แยกจากตำแหน่งที่วัด"
                : "เตรียมเครื่องวัดให้นิ่งและให้ตัวเลขอยู่กลางภาพ"}
          </p>
        </div>
      )}
      {(evidence || draft) && (
        <aside className="cp-report-draft-notice">
          <p>
            {restored
              ? "กู้คืนร่างรายงานแล้ว"
              : "ร่างรายงานเก็บชั่วคราวในแท็บนี้"}{" "}
            · เก็บไม่เกิน 30 นาที และล้างเมื่อออกจากระบบหรือปิดแท็บ
          </p>
          <ConfirmAction
            label="ทิ้งร่างรายงาน"
            description="ทิ้งภาพและข้อมูลร่างนี้? รายงานที่ส่งแล้วจะไม่เปลี่ยน"
            disabled={sending}
            onConfirm={() => void discardDraft()}
          />
        </aside>
      )}
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
          <span>อ่านข้อมูล</span>
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
            <strong>เข้าสู่ระบบเพื่อเริ่มส่งรายงาน</strong>
            <small>ใช้บัญชี Google เพื่อบันทึกและติดตามรายงานของคุณ</small>
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
      {(auth.user || auth.localDemo) && (
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
                initialEvidence={evidence ?? undefined}
                onLoginRequired={() =>
                  loginPrompt.openLoginPrompt({
                    title: "เข้าสู่ระบบก่อนเพิ่มภาพ",
                    description:
                      "ใช้บัญชี Google เพื่อยืนยันผู้ส่งและติดตามผลการตรวจรายงาน",
                  })
                }
                onCaptured={captureEvidence}
                onCleared={clearEvidence}
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
              {locationIssue && <p role="alert">{locationIssue}</p>}
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
                  <p>{ocrStatusMessage}</p>
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
                  <div>
                    <OcrReadingDisplay
                      value={draft.ocr_pm25}
                      capturedAt={draft.captured_at}
                    />
                    {evidence?.measuredLocation && (
                      <p>
                        ตำแหน่งจากภาพ {evidence.measuredLocation.lat.toFixed(5)}
                        , {evidence.measuredLocation.lon.toFixed(5)}
                      </p>
                    )}
                  </div>
                  {participation?.supportsContext && (
                    <fieldset className="cp-report-context">
                      <legend>บริบทที่วัด</legend>
                      <p>
                        สำหรับโบนัสบริการ ระบบจะขอตำแหน่งใหม่ขณะส่ง
                        หากตรวจโบนัสไม่ได้ ยังส่งรายงานได้ตามปกติ
                      </p>
                      <label>
                        รุ่นเครื่องวัด (ไม่บังคับ)
                        <input
                          value={deviceModel}
                          maxLength={80}
                          onChange={(event) =>
                            setDeviceModel(event.target.value)
                          }
                          placeholder="ระบุเมื่อทราบรุ่นเครื่อง"
                          disabled={sending}
                        />
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={nearEmissionSource}
                          onChange={(event) =>
                            setNearEmissionSource(event.target.checked)
                          }
                          disabled={sending}
                        />
                        วัดติดแหล่งกำเนิดโดยตรง เช่น ควันท่อไอเสีย
                      </label>
                      <p>
                        ข้อมูลที่คุณระบุช่วยอธิบายรายงาน ไม่ใช่ผลตรวจสอบเครื่อง
                      </p>
                      <label>
                        บริเวณที่วัด
                        <select
                          value={measurementEnvironment}
                          disabled={sending}
                          onChange={(event) =>
                            setMeasurementEnvironment(
                              event.target
                                .value as typeof measurementEnvironment,
                            )
                          }
                        >
                          <option value="unknown">ไม่ทราบ / ไม่ระบุ</option>
                          <option value="outdoor">กลางแจ้ง</option>
                          <option value="indoor">ในอาคาร</option>
                        </select>
                      </label>
                      <label>
                        ช่วงเวลาเฉลี่ยบนเครื่อง
                        <select
                          value={averagingPeriod}
                          disabled={sending}
                          onChange={(event) =>
                            setAveragingPeriod(
                              event.target.value as typeof averagingPeriod,
                            )
                          }
                        >
                          <option value="unknown">ไม่ทราบ</option>
                          <option value="instant">ค่าขณะวัด</option>
                          <option value="1_minute">เฉลี่ย 1 นาที</option>
                          <option value="5_minutes">เฉลี่ย 5 นาที</option>
                        </select>
                      </label>
                    </fieldset>
                  )}
                  <div
                    className="cp-report-identity-choice"
                    data-hidden={hideIdentity}
                  >
                    <div className="cp-report-identity-choice__preview">
                      <span aria-hidden>
                        {!hideIdentity && googleProfile?.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={googleProfile.avatarUrl}
                            alt=""
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <AppIcon name="user" size={21} />
                        )}
                      </span>
                      <div>
                        <strong>
                          {hideIdentity
                            ? (publicAlias ?? "นามแฝง ClearPath")
                            : (googleProfile?.displayName ??
                              "ชื่อ Google ของคุณ")}
                        </strong>
                        <small>
                          {hideIdentity
                            ? "แสดงชื่อเล่น โดยไม่เผยชื่อหรือรูป Google และไม่ลิงก์ไปอันดับ"
                            : "แสดงชื่อและรูป Google บนรายงานและหมุดแผนที่"}
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
                      <span>ปิดบังตัวตนในรายงานนี้ · ใช้ชื่อเล่น</span>
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
          {evidence && !draft && error && hasGps && !locationIssue && (
            <button
              type="button"
              className="cp-report-retry cp-focus"
              disabled={sending}
              onClick={retryAnalysis}
            >
              ลองอ่านภาพอีกครั้ง
            </button>
          )}
          {evidence && !draft && (
            <p role="status">
              {sending
                ? "กำลังอ่านค่า PM2.5 จากภาพ…"
                : locationIssue
                  ? "ยังไม่ได้เริ่มอ่านภาพ กรุณาแก้ไขตำแหน่งแล้วลองอีกครั้ง ภาพที่เลือกยังอยู่"
                  : hasGps
                    ? "ภาพที่เลือกยังอยู่ คุณลองอ่านภาพเดิมอีกครั้งได้"
                    : "กำลังรับตำแหน่ง GPS จากอุปกรณ์…"}
            </p>
          )}
        </form>
      )}

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
    </section>
  );
}
