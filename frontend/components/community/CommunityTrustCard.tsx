"use client";
import { useRef, useState } from "react";
import type {
  CommunityTrust,
  CommunityTrustReviewItem,
} from "@/frontend/types/community-trust";
import { api, apiErrorMessage } from "@/frontend/lib/api-client";
import styles from "./ReporterTrustCard.module.css";
import formStyles from "./CommunityTrustCard.module.css";

export default function CommunityTrustCard({
  trust,
  compact = false,
  reviewable = false,
}: {
  trust?: CommunityTrust | null;
  compact?: boolean;
  reviewable?: boolean;
}) {
  const [message, setMessage] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [reviewUpdates, setReviewUpdates] = useState<
    CommunityTrustReviewItem[] | null
  >(null);
  const [reviewError, setReviewError] = useState("");
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const reviewRequest = useRef(0);
  async function loadReviews() {
    const request = ++reviewRequest.current;
    setReviewError("");
    setReviewsLoading(true);
    try {
      const result = await api.communityTrustOwnerReviews();
      if (request === reviewRequest.current) setReviewUpdates(result.requests);
    } catch {
      if (request === reviewRequest.current)
        setReviewError("โหลดผลทบทวนไม่สำเร็จ กรุณาลองอีกครั้ง");
    } finally {
      if (request === reviewRequest.current) setReviewsLoading(false);
    }
  }
  if (!trust) return null;
  const supportKnown =
    trust.status !== "unavailable" || trust.calculated_at != null;
  const label =
    trust.status === "available" && trust.score != null
      ? `${trust.score.toFixed(1)}/100`
      : trust.status === "updating"
        ? "กำลังอัปเดต"
        : trust.status === "unavailable"
          ? "โหลดคะแนนไม่ได้"
          : "เสียงประเมินยังไม่เพียงพอ";
  if (compact)
    return <span className={styles.compact}>Trust ชุมชน · {label}</span>;
  return (
    <section className={styles.panel} aria-label="Trust ชุมชน">
      <h3>Trust ชุมชน</h3>
      <p className={styles.score}>{label}</p>
      {trust.score != null && trust.status !== "available" && (
        <p>ค่าล่าสุด {trust.score.toFixed(1)}/100 · รออัปเดต</p>
      )}
      {supportKnown && (
        <p>
          บัญชีผู้ประเมิน {trust.unique_voter_accounts} บัญชี ·{" "}
          {trust.evaluated_report_count} รายงาน · ครอบคลุม{" "}
          {trust.evaluated_day_count} วัน
        </p>
      )}
      {trust.calculated_at && (
        <p>
          คำนวณล่าสุด{" "}
          <time dateTime={trust.calculated_at}>
            {new Date(trust.calculated_at).toLocaleString("th-TH", {
              timeZone: "Asia/Bangkok",
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </time>
        </p>
      )}
      <details>
        <summary className="cp-focus">สูตรและข้อมูลรองรับ</summary>
        <p>
          ประวัติเสียงประเมินการรายงานจากชุมชน
          ไม่ใช่การรับรองความแม่นยำของค่าฝุ่นหรือเครื่องวัด
        </p>
        <p>
          เฉลี่ยคะแนนรายวันใน 90 วันปฏิทินล่าสุดตามเวลาไทย
          แต่ละวันมีน้ำหนักเท่าจำนวนเสียง สูงสุด 3 ต้องมีอย่างน้อย 3 บัญชี 3
          รายงาน และ 3 วันจึงแสดงคะแนน
        </p>
        <p>
          หนึ่งบัญชีมีผลต่อผู้รายงานหนึ่งคนได้หนึ่งเสียงต่อวัน และสูงสุด 3 วันใน
          30 วัน คะแนนลดลงได้และไม่เกี่ยวกับแต้ม ยศ อันดับ หรือสิทธิ์โหวต
        </p>
        <p>
          {trust.window_start} ถึง {trust.window_end} · น้ำหนักรวม{" "}
          {trust.effective_day_weight} · นโยบาย {trust.policy_version}
        </p>
        <p>
          ไม่นับเสียงของเจ้าของรายงาน เสียงเก่า เหตุผลเกี่ยวกับ
          OCR/ระบบ/ความต่างจากสถานีเพียงอย่างเดียว หรือเสียงที่ไม่ผ่าน
          GPS/หลักฐานและเพดานรายคู่
        </p>
        <p>
          พารามิเตอร์นี้เป็นนโยบายของ ClearPath ที่จะประเมินจากการใช้งานต่อไป
          ไม่ใช่เกณฑ์รับรองความถูกต้องทางวิทยาศาสตร์
        </p>
        <ul>
          {trust.daily.map((day) => (
            <li key={day.day}>
              {day.day}: บวก {day.positive} ลบ {day.negative} ·{" "}
              {day.value.toFixed(1)}/100 · น้ำหนัก {day.weight}
            </li>
          ))}
        </ul>
      </details>
      {reviewable && trust.review_available && (
        <details
          onToggle={(e) => {
            if (e.currentTarget.open && reviewUpdates === null)
              void loadReviews();
          }}
        >
          <summary className="cp-focus">ติดตามคำขอทบทวน</summary>
          {reviewError && <p role="alert">{reviewError}</p>}
          <button
            className="cp-focus cp-btn"
            disabled={reviewsLoading}
            type="button"
            onClick={() => void loadReviews()}
          >
            {reviewsLoading ? "กำลังโหลด…" : "โหลดคำขอใหม่"}
          </button>
          {reviewUpdates === null ? (
            !reviewError && <p role="status">กำลังโหลดคำขอทบทวน…</p>
          ) : reviewUpdates.length ? (
            <ul>
              {reviewUpdates.map((r) => (
                <li key={r.id}>
                  {r.from_day && r.to_day && (
                    <p>
                      ช่วงวันที่ {r.from_day} ถึง {r.to_day}
                    </p>
                  )}
                  {r.message && <p>{r.message}</p>}
                  {r.status === "reviewed" ? "ทบทวนแล้ว" : "รอทบทวน"}
                  {r.reason && <p>{r.reason}</p>}
                </li>
              ))}
            </ul>
          ) : (
            <p>ยังไม่มีคำขอทบทวน</p>
          )}
        </details>
      )}
      {supportKnown && (
        <p>
          ความต่อเนื่อง: ช่วยรายงาน {trust.contribution_days_30} วันใน 30
          วันล่าสุด
        </p>
      )}
      {reviewable && trust.review_available && (
        <details>
          <summary className="cp-focus">ขอทบทวนเสียงประเมิน</summary>
          <form
            className={formStyles.review}
            onSubmit={async (e) => {
              e.preventDefault();
              setPending(true);
              setFeedback("");
              try {
                await api.communityTrustReview({
                  from_day: from,
                  to_day: to,
                  message,
                });
                setFeedback("บันทึกคำขอทบทวนแล้ว");
                void loadReviews();
              } catch (error) {
                setFeedback(apiErrorMessage(error, "ส่งคำขอไม่สำเร็จ"));
              } finally {
                setPending(false);
              }
            }}
          >
            <label>
              ตั้งแต่วันที่
              <input
                className="cp-input"
                type="date"
                required
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label>
              ถึงวันที่
              <input
                className="cp-input"
                type="date"
                required
                min={from}
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
            <label>
              เหตุผลขอทบทวน
              <textarea
                className="cp-input"
                required
                minLength={10}
                maxLength={1000}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </label>
            <button className="cp-focus" disabled={pending} type="submit">
              {pending ? "กำลังส่ง…" : "ส่งคำขอทบทวน"}
            </button>
            {feedback && <p role="status">{feedback}</p>}
          </form>
        </details>
      )}
    </section>
  );
}
