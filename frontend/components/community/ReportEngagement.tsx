"use client";

import { FormEvent, useEffect, useState } from "react";

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
}: {
  report: CommunityReport;
}) {
  const auth = useAuth();
  const viewer = auth.user?.id ?? (auth.localDemo ? "local" : "guest");
  return <EngagementContent key={`${report.id}:${viewer}`} report={report} />;
}

function EngagementContent({ report }: { report: CommunityReport }) {
  const auth = useAuth();
  const loginPrompt = useLoginPrompt();
  const [engagement, setEngagement] = useState(() => initialEngagement(report));
  const [commentsOpen, setCommentsOpen] = useState(false);
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
      setReactionPhase(
        !removing && engagement.location_required ? "locating" : "sending",
      );
      const location =
        !removing && engagement.location_required
          ? await requestReactionLocation()
          : undefined;
      setReactionPhase("sending");
      const result = removing
        ? await api.clearReportReaction(report.id)
        : await api.setReportReaction(report.id, {
            reaction: kind,
            location,
            reason_code: kind === "like" ? "useful" : reasonCode,
          });
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

  return (
    <section
      className="cp-report-engagement"
      aria-label="ปฏิกิริยาและความคิดเห็น"
    >
      <div className="cp-report-engagement__actions">
        <button
          type="button"
          className="cp-focus"
          data-active={engagement.viewer_reaction === "like"}
          disabled={
            pending ||
            (signedIn && loadStatus !== "loaded") ||
            (engagement.location_policy_ready === false &&
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
            (engagement.location_policy_ready === false &&
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
          aria-expanded={commentsOpen}
          onClick={() => {
            if (!signedIn) {
              loginPrompt.openLoginPrompt({
                title: "เข้าสู่ระบบเพื่อแสดงความคิดเห็น",
                description:
                  "ใช้บัญชี Google เพื่อร่วมสนทนาและช่วยยืนยันข้อมูลจากชุมชน",
              });
              return;
            }
            setCommentsOpen((open) => !open);
          }}
        >
          <AppIcon name="comment" size={18} />
          <span>ความคิดเห็น</span>
          <b>{engagement.comment_count}</b>
        </button>
      </div>

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
                รัศมีชั่วคราว รวมความคลาดเคลื่อน GPS ของทั้งสองฝั่ง
                หากคร่อมขอบเขตให้ขอตำแหน่งใหม่หรือขยับเข้าใกล้จุดวัด
                การโหวตไม่มีผลต่อคะแนนหรือหลักฐานรายงาน
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
            <option value="image_unclear">ภาพอ่านไม่ชัด</option>
            <option value="context_question">
              มีข้อสงสัยเรื่องบริบทการวัด
            </option>
            <option value="value_question">มีข้อสงสัยเรื่องค่าที่อ่าน</option>
          </select>
          <p>ส่งเป็นข้อสงสัยเพื่อประกอบการตรวจ ไม่หักคะแนนผู้รายงานอัตโนมัติ</p>
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

      {commentsOpen && (
        <div className="cp-report-comments">
          {signedIn && (
            <form onSubmit={submitComment}>
              <label htmlFor={`comment-${report.id}`}>เขียนความคิดเห็น</label>
              <p
                className="cp-report-comments__hint"
                id={`comment-hint-${report.id}`}
              >
                เลือกข้อความแนะนำแล้วแก้ไขได้ กรุณาแสดงความคิดเห็นอย่างสุภาพ
              </p>
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
              <div className="cp-report-comments__composer">
                <textarea
                  id={`comment-${report.id}`}
                  aria-describedby={`comment-hint-${report.id}`}
                  value={comment}
                  maxLength={500}
                  rows={2}
                  disabled={pending}
                  placeholder="เลือกข้อความด้านบนหรือพิมพ์ความคิดเห็น"
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
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
