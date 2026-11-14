"use client";

import { FormEvent, useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";

import { useAuth } from "@/frontend/components/auth/AuthProvider";
import { useLoginPrompt } from "@/frontend/components/auth/LoginPromptProvider";
import { requestReactionLocation } from "@/frontend/lib/reaction-location";
import AppIcon from "@/frontend/components/ui/AppIcon";
import { api, apiErrorMessage } from "@/frontend/lib/api-client";
import type {
  CommunityReport,
  ReactionKind,
  ReportEngagementResponse,
  ReportReactionRequest,
} from "@/frontend/types";

const COMMENT_SUGGESTIONS = [
  "ขอบคุณที่แบ่งปันข้อมูล",
  "ภาพเครื่องวัดอ่านได้ชัดเจน",
  "ช่วยถ่ายภาพตัวเลขให้ชัดขึ้นได้ไหม",
  "วัดในอาคารหรือกลางแจ้งครับ/คะ",
];

function initialEngagement(report: CommunityReport): ReportEngagementResponse {
  return {
    like_count: report.like_count ?? 0,
    dislike_count: report.dislike_count ?? 0,
    comment_count: report.comment_count ?? 0,
    viewer_reaction: null,
    comments: [],
  };
}

export default function ReportEngagement({
  report,
  evidenceReady = false,
  actionsContainer,
  onRevealDetails,
}: {
  report: CommunityReport;
  evidenceReady?: boolean;
  actionsContainer?: HTMLElement | null;
  onRevealDetails?: () => void;
}) {
  const auth = useAuth();
  const viewer = auth.user?.id ?? (auth.localDemo ? "local" : "guest");
  return (
    <EngagementContent
      key={`${report.id}:${viewer}`}
      report={report}
      evidenceReady={evidenceReady}
      actionsContainer={actionsContainer}
      onRevealDetails={onRevealDetails}
    />
  );
}

function EngagementContent({
  report,
  evidenceReady,
  actionsContainer,
  onRevealDetails,
}: {
  report: CommunityReport;
  evidenceReady: boolean;
  actionsContainer?: HTMLElement | null;
  onRevealDetails?: () => void;
}) {
  const retryKey = useRef<{ intent: string; key: string } | null>(null);
  const auth = useAuth();
  const loginPrompt = useLoginPrompt();
  const [engagement, setEngagement] = useState(() => initialEngagement(report));
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentReveal, setCommentReveal] = useState(0);
  const [comment, setComment] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reasonCode, setReasonCode] =
    useState<ReportReactionRequest["reason_code"]>();
  const [reasonOpen, setReasonOpen] = useState(false);
  const [loadStatus, setLoadStatus] = useState<"loading" | "loaded" | "error">(
    "loading",
  );
  const [reload, setReload] = useState(0);
  const [reactionPhase, setReactionPhase] = useState<
    "locating" | "sending" | null
  >(null);
  const signedIn = Boolean(auth.user || auth.localDemo);
  const reportId = report.id;
  const commentsRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!commentsOpen) return;
    const sheet = commentsRef.current?.closest("[data-map-sheet]");
    let revealed = false;
    const reveal = () => {
      if (revealed) return;
      revealed = true;
      composerRef.current?.scrollIntoView?.({
        block: "nearest",
        behavior: "auto",
      });
      composerRef.current?.focus({ preventScroll: true });
    };
    const expanded = (event: Event) => {
      if (
        event.target === sheet &&
        (event as TransitionEvent).propertyName === "height"
      )
        reveal();
    };
    sheet?.addEventListener("transitionend", expanded);
    // Let the 180ms sheet expansion finish before revealing/focusing the input.
    // The fallback handles content-sized sheets and reduced-motion transitions.
    const timer = setTimeout(
      reveal,
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 0 : 220,
    );
    return () => {
      clearTimeout(timer);
      sheet?.removeEventListener("transitionend", expanded);
    };
  }, [commentsOpen, commentReveal]);

  useEffect(() => {
    let cancelled = false;
    const request = signedIn
      ? api.myReportEngagement(reportId)
      : api.reportEngagement(reportId);
    void request
      .then((result) => {
        if (!cancelled) {
          setEngagement(result);
          setLoadStatus("loaded");
        }
      })
      .catch(() => {
        if (!cancelled) setLoadStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [signedIn, reportId, reload]);

  function retryLoad() {
    setLoadStatus("loading");
    setReload((value) => value + 1);
  }

  async function react(kind: ReactionKind) {
    if (!signedIn) {
      loginPrompt.openLoginPrompt({
        title: "เข้าสู่ระบบเพื่อร่วมแสดงความคิดเห็น",
        description:
          "ใช้บัญชี Google เพื่อกดถูกใจ ไม่ถูกใจ และแสดงความคิดเห็นต่อรายงานนี้",
      });
      return;
    }
    if (pending || loadStatus !== "loaded") return;
    if (kind === "like") setReasonOpen(false);
    setPending(true);
    setError(null);
    try {
      const removing = engagement.viewer_reaction === kind;
      const trustMode = engagement.community_trust_collecting;
      const intent = `${removing ? "withdraw" : kind}:${reasonCode ?? ""}`;
      if (trustMode && retryKey.current?.intent !== intent)
        retryKey.current = { intent, key: crypto.randomUUID() };
      const requestKey = trustMode ? retryKey.current?.key : undefined;
      setReactionPhase(
        !removing && engagement.location_required ? "locating" : "sending",
      );
      const location =
        !removing && engagement.location_required
          ? await requestReactionLocation()
          : undefined;
      setReactionPhase("sending");
      const result = removing
        ? await (requestKey
            ? api.clearReportReaction(report.id, requestKey)
            : api.clearReportReaction(report.id))
        : await api.setReportReaction(report.id, {
            ...(requestKey
              ? {
                  request_key: requestKey,
                  trust_policy_version: "community-trust-v1" as const,
                }
              : {}),
            reaction: kind,
            location,
            reason_code: kind === "like" ? "useful" : reasonCode,
          });
      retryKey.current = null;
      setEngagement(result);
      setReasonOpen(false);
      setReasonCode(undefined);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : apiErrorMessage(cause, "ส่งปฏิกิริยาไม่สำเร็จ"),
      );
    } finally {
      setPending(false);
      setReactionPhase(null);
    }
  }

  async function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = comment.trim();
    if (!signedIn || !body || pending) return;
    setPending(true);
    setError(null);
    try {
      const saved = await api.addReportComment(report.id, { body });
      setEngagement((current) => ({
        ...current,
        comment_count: current.comment_count + 1,
        comments: [saved, ...current.comments],
      }));
      setComment("");
      setCommentsOpen(true);
    } catch (cause) {
      setError(apiErrorMessage(cause, "ส่งความคิดเห็นไม่สำเร็จ"));
    } finally {
      setPending(false);
    }
  }

  async function removeComment(commentId: string) {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await api.removeReportComment(report.id, commentId);
      setEngagement((current) => ({
        ...current,
        comment_count: Math.max(0, current.comment_count - 1),
        comments: current.comments.filter((item) => item.id !== commentId),
      }));
    } catch (cause) {
      setError(apiErrorMessage(cause, "ลบความคิดเห็นไม่สำเร็จ"));
    } finally {
      setPending(false);
    }
  }

  const actions = (
    <div className="cp-report-engagement__actions">
      <button
        type="button"
        className="cp-focus"
        data-active={engagement.viewer_reaction === "like"}
        disabled={
          pending ||
          (signedIn && loadStatus !== "loaded") ||
          ((engagement.location_policy_ready === false ||
            (engagement.community_trust_collecting && !evidenceReady)) &&
            engagement.viewer_reaction !== "like")
        }
        aria-pressed={engagement.viewer_reaction === "like"}
        onClick={() => void react("like")}
      >
        <AppIcon name="thumb-up" size={18} />
        <span>ถูกใจ</span>
        <b>{engagement.like_count}</b>
      </button>
      <button
        type="button"
        className="cp-focus"
        data-active={engagement.viewer_reaction === "dislike"}
        disabled={
          pending ||
          (signedIn && loadStatus !== "loaded") ||
          ((engagement.location_policy_ready === false ||
            (engagement.community_trust_collecting && !evidenceReady)) &&
            engagement.viewer_reaction !== "dislike")
        }
        aria-pressed={engagement.viewer_reaction === "dislike"}
        aria-expanded={reasonOpen}
        aria-controls={`reaction-reason-${reportId}`}
        onClick={() => {
          if (
            signedIn &&
            engagement.location_required &&
            engagement.viewer_reaction !== "dislike"
          ) {
            setError(null);
            setReasonOpen(true);
            onRevealDetails?.();
          } else void react("dislike");
        }}
      >
        <AppIcon name="thumb-down" size={18} />
        <span>ไม่ถูกใจ</span>
        <b>{engagement.dislike_count}</b>
      </button>
      <button
        type="button"
        className="cp-focus"
        aria-label={`ความคิดเห็น ${engagement.comment_count}`}
        aria-controls={`comments-${reportId}`}
        aria-expanded={commentsOpen}
        onClick={(event) => {
          if (!signedIn) {
            loginPrompt.openLoginPrompt({
              title: "เข้าสู่ระบบเพื่อแสดงความคิดเห็น",
              description:
                "ใช้บัญชี Google เพื่อร่วมสนทนาและช่วยยืนยันข้อมูลจากชุมชน",
            });
            return;
          }
          const collapsed =
            event.currentTarget
              .closest("[data-map-sheet]")
              ?.getAttribute("data-snap") === "peek";
          if (!commentsOpen || collapsed) {
            onRevealDetails?.();
            setCommentsOpen(true);
            setCommentReveal((value) => value + 1);
          } else setCommentsOpen(false);
        }}
      >
        <AppIcon name="comment" size={18} />
        <span>{actionsContainer ? "ความเห็น" : "ความคิดเห็น"}</span>
        <b>{engagement.comment_count}</b>
      </button>
    </div>
  );

  return (
    <section
      className="cp-report-engagement"
      aria-label="ปฏิกิริยาและความคิดเห็น"
    >
      {actionsContainer ? createPortal(actions, actionsContainer) : actions}

      {commentsOpen && (
        <div
          ref={commentsRef}
          id={`comments-${reportId}`}
          className="cp-report-comments"
          tabIndex={-1}
        >
          {signedIn && (
            <form onSubmit={submitComment}>
              <label htmlFor={`comment-${report.id}`}>เขียนความคิดเห็น</label>
              <p
                className="cp-report-comments__hint"
                id={`comment-hint-${report.id}`}
              >
                เลือกข้อความแนะนำแล้วแก้ไขได้ กรุณาแสดงความคิดเห็นอย่างสุภาพ
              </p>
              <div className="cp-report-comments__composer">
                <textarea
                  ref={composerRef}
                  id={`comment-${report.id}`}
                  aria-describedby={`comment-hint-${report.id}`}
                  value={comment}
                  maxLength={500}
                  rows={2}
                  disabled={pending}
                  placeholder="พิมพ์ความคิดเห็นของคุณ"
                  onChange={(event) => setComment(event.target.value)}
                />
                <button
                  type="submit"
                  className="cp-focus"
                  disabled={pending || !comment.trim()}
                  aria-label="ส่งความคิดเห็น"
                >
                  <AppIcon name="send" size={18} />
                </button>
              </div>
              <details className="cp-report-comments__quick">
                <summary className="cp-focus">ข้อความแนะนำ</summary>
                <div
                  className="cp-report-comments__suggestions"
                  role="group"
                  aria-label="ข้อความแนะนำ"
                >
                  {COMMENT_SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      className="cp-focus"
                      disabled={pending}
                      aria-pressed={comment === suggestion}
                      onClick={() => setComment(suggestion)}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </details>
            </form>
          )}
          {engagement.comments.length === 0 ? (
            <p className="cp-report-comments__empty">
              {loadStatus === "loaded"
                ? "ยังไม่มีความคิดเห็น"
                : loadStatus === "error"
                  ? "ยังโหลดความคิดเห็นไม่ได้ กดลองโหลดใหม่ด้านบน"
                  : "กำลังโหลดความคิดเห็น…"}
            </p>
          ) : (
            <ul>
              {engagement.comments.map((item) => (
                <li key={item.id}>
                  <div>
                    <strong>{item.display_name ?? "สมาชิก ClearPath"}</strong>
                    <time dateTime={item.created_at}>
                      {new Date(item.created_at).toLocaleString("th-TH", {
                        dateStyle: "short",
                        timeStyle: "short",
                        timeZone: "Asia/Bangkok",
                      })}
                    </time>
                  </div>
                  <p>{item.body}</p>
                  {item.is_own && (
                    <button
                      type="button"
                      className="cp-focus"
                      disabled={pending}
                      onClick={() => void removeComment(item.id)}
                    >
                      ลบความคิดเห็น
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {engagement.community_trust_collecting && (
        <div className="cp-community-trust-notice">
          <details>
            <summary className="cp-focus">
              เสียงที่ผ่านเงื่อนไขมีผลต่อ Trust ชุมชน
            </summary>
            <p>
              ถูกใจ: หลักฐานและบริบททำให้เชื่อถือการรายงานนี้ได้ · ไม่ถูกใจ:
              มีข้อสงสัยต่อหลักฐานหรือบริบท
            </p>
            <p>
              นับเฉพาะเสียงที่ผ่านเกณฑ์ แยกจากยอดถูกใจ แต้มและยศ
              เป็นนโยบายทดลองของ ClearPath
            </p>
          </details>
          {!evidenceReady && (
            <p role="status">
              กรุณาเปิดภาพและข้อมูลสำคัญด้านบนให้พร้อมก่อนประเมิน
              หากภาพเปิดไม่ได้ ยังไม่รับเป็นเสียง Trust
            </p>
          )}
          {engagement.trust_exclusion_reason && (
            <p role="status">
              เสียงนี้ไม่เข้า Trust:{" "}
              {(
                {
                  pair_day_limit: "ครบเพดาน 3 วันต่อคู่บัญชีใน 30 วัน",
                  reason_not_trust:
                    "เหตุผลนี้เกี่ยวกับระบบหรือยังประเมินไม่ได้",
                  gps_invalid: "กรุณาขอตำแหน่งใหม่",
                  gps_clock_invalid:
                    "เวลาตำแหน่งอยู่ในอนาคต กรุณาตรวจเวลาอุปกรณ์และขอตำแหน่งใหม่",
                  gps_expired: "ตำแหน่งเกิน 2 นาที กรุณาขอใหม่",
                  gps_uncertain:
                    "ความคลาดเคลื่อนคร่อมขอบ 500 ม. กรุณาขอตำแหน่งใหม่",
                  outside_area: "อยู่นอกระยะ 500 ม.",
                  report_expired: "รายงานพ้น 3 ชั่วโมงแล้ว",
                  evidence_unavailable: "หลักฐานเปิดไม่ได้",
                  superseded_daily_vote:
                    "ใช้การประเมินล่าสุดของคุณในวันนั้นแทน",
                } as Record<string, string>
              )[engagement.trust_exclusion_reason] ??
                "ไม่ผ่านเงื่อนไขการประเมิน"}
            </p>
          )}
          {engagement.trust_projection_status === "updating" &&
            engagement.viewer_reaction &&
            !engagement.trust_hold_until && (
              <p role="status">บันทึกปฏิกิริยาแล้ว กำลังอัปเดต Trust ชุมชน</p>
            )}
          {engagement.trust_hold_until && (
            <p role="status">
              พักผล Trust ชั่วคราวถึง{" "}
              {new Date(engagement.trust_hold_until).toLocaleTimeString(
                "th-TH",
                {
                  timeZone: "Asia/Bangkok",
                  hour: "2-digit",
                  minute: "2-digit",
                },
              )}{" "}
              · ไม่ใช่ข้อสรุปว่าผิดกติกา
            </p>
          )}
        </div>
      )}
      {engagement.location_required && (
        <div className="cp-report-comments__hint">
          {engagement.location_policy_ready === false ? (
            <p>
              ยังไม่เปิดโหวตตามตำแหน่ง ระยะรับโหวตยังอยู่ระหว่างประเมิน
              แสดงความคิดเห็นได้ตามปกติ
            </p>
          ) : (
            <details>
              <summary>
                โหวตใกล้จุดวัดภายใน {engagement.reaction_radius_m ?? 500} เมตร
              </summary>
              <p>
                {engagement.community_trust_collecting
                  ? "ใช้นโยบายทดลอง ระยะถึงจุดวัดจริงรวมความคลาดเคลื่อน GPS ของคุณต้องไม่เกิน 500 ม. ตำแหน่งต้องไม่เกิน 2 นาที GPS ตรวจเพียงความใกล้เคียง ไม่รับรองว่ามีเครื่องวัดหรือป้องกันการปลอมตำแหน่งได้ทั้งหมด"
                  : "รัศมีชั่วคราว รวมความคลาดเคลื่อน GPS ของทั้งสองฝั่ง หากคร่อมขอบเขตให้ขอตำแหน่งใหม่ การโหวตไม่มีผลต่อแต้ม"}
              </p>
            </details>
          )}
        </div>
      )}
      {loadStatus === "loading" && (
        <p className="cp-engagement-status" role="status">
          กำลังโหลดปฏิกิริยา…
        </p>
      )}
      {loadStatus === "error" && (
        <div className="cp-engagement-feedback" role="alert">
          <p>โหลดปฏิกิริยาและความคิดเห็นไม่สำเร็จ</p>
          <button type="button" className="cp-focus" onClick={retryLoad}>
            ลองโหลดใหม่
          </button>
        </div>
      )}
      {reasonOpen && (
        <form
          className="cp-reaction-reason"
          id={`reaction-reason-${reportId}`}
          onSubmit={(event) => {
            event.preventDefault();
            if (reasonCode) void react("dislike");
          }}
        >
          <label htmlFor={`reason-${reportId}`}>เหตุผลเมื่อไม่ถูกใจ</label>
          {engagement.community_trust_collecting && (
            <p>
              เป็นข้อสงสัยจากชุมชน ไม่ใช่ข้อสรุปว่าผู้รายงานโกงหรือให้ข้อมูลเท็จ
            </p>
          )}
          <select
            autoFocus
            id={`reason-${reportId}`}
            value={reasonCode ?? ""}
            disabled={pending}
            onChange={(event) =>
              setReasonCode(
                event.target.value as ReportReactionRequest["reason_code"],
              )
            }
          >
            <option value="" disabled>
              เลือกเหตุผล
            </option>
            {engagement.community_trust_collecting ? (
              <>
                <option value="report_context_doubt">
                  สงสัยภาพหรือข้อมูลไม่สอดคล้องกับบริบท
                </option>
                <option value="image_context_doubt">
                  สงสัยภาพเก่าหรือไม่เกี่ยวข้องกับรายงาน
                </option>
                <option value="ocr_mismatch">
                  ระบบอ่านตัวเลขไม่ตรงภาพ · ไม่เข้า Trust
                </option>
                <option value="system_display_issue">
                  ระบบแสดงข้อมูลผิด · ไม่เข้า Trust
                </option>
                <option value="station_disagreement_only">
                  ต่างจากสถานีเพียงอย่างเดียว · ไม่เข้า Trust
                </option>
                <option value="cannot_assess">
                  หลักฐานยังไม่พอให้ประเมิน · ไม่เข้า Trust
                </option>
              </>
            ) : (
              <>
                <option value="image_unclear">ภาพอ่านไม่ชัด</option>
                <option value="context_question">
                  มีข้อสงสัยเรื่องบริบทการวัด
                </option>
                <option value="value_question">
                  มีข้อสงสัยเรื่องค่าที่อ่าน
                </option>
              </>
            )}
          </select>
          <p>
            {engagement.community_trust_collecting
              ? "เสียงลบที่ผ่านเกณฑ์มีผลต่อค่าเฉลี่ย Trust ชุมชน แต่ไม่เปลี่ยนแต้มและยศ และไม่ใช่ผลตัดสินว่ารายงานเท็จ"
              : "ส่งเป็นข้อสงสัยเพื่อประกอบการตรวจ ไม่หักแต้มผู้รายงานอัตโนมัติ"}
          </p>
          <div>
            <button
              type="button"
              className="cp-focus"
              disabled={pending}
              onClick={() => {
                setReasonOpen(false);
                setReasonCode(undefined);
              }}
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              className="cp-focus"
              disabled={pending || !reasonCode}
            >
              ส่งไม่ถูกใจ
            </button>
          </div>
        </form>
      )}
      {reactionPhase && (
        <p className="cp-engagement-status" role="status">
          {reactionPhase === "locating"
            ? "กำลังขอตำแหน่ง GPS…"
            : "กำลังบันทึกปฏิกิริยา…"}
        </p>
      )}
      {!signedIn && (
        <p className="cp-report-engagement__signin">
          กดปุ่มด้านบนเพื่อเข้าสู่ระบบด้วย Google
        </p>
      )}

      {error && <p role="alert">{error}</p>}
    </section>
  );
}
