"use client";

import { FormEvent, useEffect, useState } from "react";

import { useAuth } from "@/frontend/components/auth/AuthProvider";
import { useLoginPrompt } from "@/frontend/components/auth/LoginPromptProvider";
import AppIcon from "@/frontend/components/ui/AppIcon";
import { api, apiErrorMessage } from "@/frontend/lib/api-client";
import type {
  CommunityReport,
  ReactionKind,
  ReportEngagementResponse,
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
  const loginPrompt = useLoginPrompt();
  const [engagement, setEngagement] = useState(() => initialEngagement(report));
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reportId = report.id;

  useEffect(() => {
    let cancelled = false;
    const request =
      auth.user || auth.localDemo
        ? api.myReportEngagement(reportId)
        : api.reportEngagement(reportId);
    void request
      .then((result) => {
        if (!cancelled) setEngagement(result);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [auth.localDemo, auth.user, reportId]);

  const signedIn = Boolean(auth.user || auth.localDemo);

  async function react(kind: ReactionKind) {
    if (!signedIn) {
      loginPrompt.openLoginPrompt({
        title: "เข้าสู่ระบบเพื่อร่วมแสดงความคิดเห็น",
        description:
          "ใช้บัญชี Google เพื่อกดถูกใจ ไม่ถูกใจ และแสดงความคิดเห็นต่อรายงานนี้",
      });
      return;
    }
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const result =
        engagement.viewer_reaction === kind
          ? await api.clearReportReaction(report.id)
          : await api.setReportReaction(report.id, { reaction: kind });
      setEngagement(result);
    } catch (cause) {
      setError(apiErrorMessage(cause, "ส่งปฏิกิริยาไม่สำเร็จ"));
    } finally {
      setPending(false);
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
          disabled={pending}
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
          disabled={pending}
          aria-pressed={engagement.viewer_reaction === "dislike"}
          onClick={() => void react("dislike")}
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
            <p className="cp-report-comments__empty">ยังไม่มีความคิดเห็น</p>
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
