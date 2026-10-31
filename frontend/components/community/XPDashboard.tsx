"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, apiErrorMessage } from "@/frontend/lib/api-client";
import type {
  XPEventsResponse,
  XPLeaderboard,
  XPSummary,
} from "@/frontend/types/xp";
import ParticipationBadge from "./ParticipationBadge";

type Period = "all" | "7d" | "30d";
const PERIODS: [Period, string][] = [
  ["all", "ตลอดชีพ"],
  ["7d", "7 วัน"],
  ["30d", "30 วัน"],
];

export default function XPDashboard({
  signedIn = true,
}: {
  signedIn?: boolean;
}) {
  const [period, setPeriod] = useState<Period>("all");
  const [summary, setSummary] = useState<XPSummary | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [board, setBoard] = useState<XPLeaderboard | null>(null);
  const [events, setEvents] = useState<XPEventsResponse | null>(null);
  const [alias, setAlias] = useState("");
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    void Promise.all([api.xpSummary(), api.xpEvents()])
      .then(([s, e]) => {
        if (cancelled) return;
        setSummary(s);
        setProfileLoaded(true);
        setEvents(e);
        setAlias(s?.alias ?? "");
        setHidden(s?.hidden ?? false);
      })
      .catch((e) => {
        if (!cancelled) setError(apiErrorMessage(e, "โหลดคะแนนไม่สำเร็จ"));
      });
    return () => {
      cancelled = true;
    };
  }, [signedIn]);
  useEffect(() => {
    let cancelled = false;
    void (signedIn ? api.myLeaderboard(period) : api.leaderboard(period))
      .then((result) => {
        if (!cancelled) {
          setBoard(result);
          setError("");
        }
      })
      .catch((e) => {
        if (!cancelled) setError(apiErrorMessage(e, "โหลดอันดับไม่สำเร็จ"));
      });
    return () => {
      cancelled = true;
    };
  }, [period, signedIn]);
  const validAlias =
    alias.trim().length >= 3 &&
    alias.trim().length <= 40 &&
    /^[\p{L}\p{N}\p{M}_\u0E00-\u0E7F .-]+$/u.test(alias.trim());
  async function save() {
    if (!validAlias) return;
    setSaving(true);
    setNotice("");
    setError("");
    try {
      const s = await api.xpSettings({ alias, hidden });
      setSummary(s);
      setAlias(s.alias);
      const refreshed = await api.myLeaderboard(period);
      setBoard((previous) =>
        previous?.period === refreshed.period ? refreshed : previous,
      );
      setNotice("บันทึกการแสดงชื่อแล้ว");
    } catch (e) {
      setError(apiErrorMessage(e, "บันทึกไม่สำเร็จ"));
    } finally {
      setSaving(false);
    }
  }
  async function more() {
    if (board?.next_offset == null || loadingMore || board.period !== period)
      return;
    const requested = period;
    setLoadingMore(true);
    try {
      const next = await (signedIn
        ? api.myLeaderboard(requested, board.next_offset)
        : api.leaderboard(requested, board.next_offset));
      setBoard((prev) =>
        prev?.period === requested
          ? { ...next, users: [...prev.users, ...next.users] }
          : prev,
      );
    } catch (e) {
      setError(apiErrorMessage(e, "โหลดอันดับเพิ่มไม่สำเร็จ"));
    } finally {
      setLoadingMore(false);
    }
  }
  return (
    <div className="cp-xp">
      {signedIn && profileLoaded && !summary && (
        <p className="cp-xp-note" role="status">
          ระบบคะแนนกำลังเตรียมเปิดใช้ คุณยังรายงานค่าฝุ่นได้ตามปกติ
        </p>
      )}
      {summary && (
        <section className="cp-xp-profile" aria-label="คะแนนและยศของฉัน">
          <span className="cp-xp-eyebrow">การมีส่วนร่วมของคุณ</span>
          <h2>{summary.alias}</h2>
          <ParticipationBadge rank={summary.rank} />
          <p className="cp-xp-total">
            {summary.lifetime_xp.toLocaleString()} <small>XP สะสม</small>
          </p>
          {summary.rank.next_xp ? (
            <>
              <progress
                aria-label="ความคืบหน้า XP ยศถัดไป"
                value={Math.min(summary.lifetime_xp, summary.rank.next_xp)}
                max={summary.rank.next_xp}
              />
              <p className="cp-xp-note">
                ยศถัดไป {summary.rank.next_label} · {summary.lifetime_xp}/
                {summary.rank.next_xp} XP · ผลงาน {summary.contribution_days}/
                {summary.rank.next_days} วัน
              </p>
            </>
          ) : (
            <p>คุณได้รับยศสูงสุดแล้ว · ผลงาน {summary.contribution_days} วัน</p>
          )}
          <div className="cp-xp-chips">
            {summary.achievements.map((a) => (
              <span key={a}>✦ {a}</span>
            ))}
          </div>
          <p className="cp-xp-note">
            วันนี้: รายงาน {summary.today_reports}/5 · โบนัสช่วยคำขอ{" "}
            {summary.today_help}/3
          </p>
          <details>
            <summary>ชื่อและความเป็นส่วนตัว</summary>
            <label>
              นามแฝง ClearPath
              <input
                maxLength={40}
                minLength={3}
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                autoComplete="nickname"
                aria-describedby="xp-alias-help"
                aria-invalid={!validAlias}
              />
            </label>
            <small id="xp-alias-help">
              3–40 ตัวอักษร ใช้ตัวอักษร ตัวเลข เว้นวรรค . - _
            </small>
            <label className="cp-xp-checkbox">
              <input
                type="checkbox"
                checked={hidden}
                onChange={(e) => setHidden(e.target.checked)}
              />
              ซ่อนฉันจากตารางอันดับ
            </label>
            <button
              type="button"
              disabled={saving || !validAlias}
              onClick={() => void save()}
            >
              {saving ? "กำลังบันทึก…" : "บันทึก"}
            </button>
            <p className="cp-xp-note">
              รายงานนิรนามจะไม่แสดงชื่อ ยศ หรือลิงก์บัญชี แต่ยังได้รับ XP
            </p>
          </details>
        </section>
      )}
      <section aria-label="อันดับชุมชน">
        <h2>อันดับชุมชน</h2>
        <p className="cp-xp-note">
          อันดับการมีส่วนร่วม ไม่ใช่อันดับความแม่นยำของข้อมูล
        </p>
        <div className="cp-xp-periods" role="group" aria-label="ช่วงเวลาอันดับ">
          {PERIODS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={period === value}
              onClick={() => setPeriod(value)}
            >
              {label}
            </button>
          ))}
        </div>
        {board?.period !== period ? (
          <p role="status">กำลังโหลดอันดับ…</p>
        ) : (
          <>
            {signedIn && (
              <p className="cp-xp-self">
                อันดับของฉัน <strong>{board.me?.rank ?? "—"}</strong>
                <span>
                  {board.me?.xp ?? 0} XP
                  {summary?.hidden ? " · ซ่อนจากอันดับ" : ""}
                </span>
              </p>
            )}
            <ol className="cp-xp-leaders">
              {board.users.map((user) => (
                <li key={user.member_id}>
                  <b>{user.rank}</b>
                  <span className="cp-xp-avatar" aria-hidden="true">
                    {Array.from(user.alias)[0]}
                  </span>
                  <Link
                    className="cp-xp-person cp-focus"
                    href={`/members/${user.member_id}`}
                  >
                    <strong>{user.alias}</strong>
                    <ParticipationBadge rank={user.title} />
                  </Link>
                  <span>
                    {user.xp.toLocaleString()}
                    <small>XP</small>
                  </span>
                </li>
              ))}
            </ol>
            {board.users.length === 0 && (
              <p className="cp-xp-empty">ยังไม่มีผลงานที่ได้รับ XP ในช่วงนี้</p>
            )}
            {board.next_offset !== null && (
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => void more()}
              >
                {loadingMore ? "กำลังโหลด…" : "โหลดเพิ่ม"}
              </button>
            )}
          </>
        )}
      </section>
      <details>
        <summary>กติกาคะแนน</summary>
        <p>
          รายงานที่อนุมัติ +10 XP สูงสุด 5 ครั้งต่อวัน · ช่วยคำขอ +5 XP สูงสุด 3
          ครั้งต่อวัน
        </p>
        <p>
          รายงานที่รับคะแนนห่างกัน 30 นาที · สูงสุด 65 XP ต่อวันตามเวลาไทย · XP
          และยศสะสมตลอดชีพ
        </p>
        <p>
          โบนัสต้องเริ่มช่วยก่อนถ่าย ภาพใหม่ไม่เกิน 15 นาที GPS
          คลาดเคลื่อนไม่เกิน 200 เมตร อยู่ใกล้จุดวัดไม่เกิน 200 เมตร
          และจุดวัดอยู่ในรัศมีคำขอ
        </p>
        <p>
          หนึ่งคนต่อคำขอและหนึ่งโบนัสต่อรายงาน คู่ผู้ขอ–ผู้ช่วยเดิมรับได้ 1
          ครั้งต่อวัน และ 3 ครั้งใน 7 วัน ไม่มีโบนัสพิเศษสำหรับคนแรก
        </p>
        <p>
          ผู้ที่เริ่มช่วยไว้ก่อนคำขอสำเร็จยังส่งได้ถึงเวลาหมดอายุเดิม หรือ 15
          นาทีหลังสำเร็จ แล้วแต่ว่าเวลาใดถึงก่อน การไม่เข้าเกณฑ์ XP
          ไม่ปิดกั้นรายงานที่ผ่านระบบตรวจเดิม
        </p>
        <p>
          ไม่มี XP จากการให้ดาว ไลก์ หรือสร้างคำขอ · ไม่เพิ่มน้ำหนัก Trust
          หรือค่าฝุ่น
        </p>
      </details>
      {signedIn && (
        <details>
          <summary>ประวัติ XP ส่วนตัว</summary>
          {events?.events.map((event) => (
            <div className="cp-xp-event" key={event.id}>
              <span>
                <strong>
                  {event.kind === "help"
                    ? "ช่วยคำขอ"
                    : event.kind === "reversal"
                      ? "ยกเลิกคะแนน"
                      : "รายงานค่าฝุ่น"}
                </strong>
                <small>
                  {event.reason} ·{" "}
                  {new Date(event.occurred_at).toLocaleString("th-TH")}
                </small>
              </span>
              <b>
                {event.points > 0 ? "+" : ""}
                {event.points} XP
              </b>
            </div>
          ))}
          {events?.next_offset != null && (
            <button
              type="button"
              onClick={() => {
                void api
                  .xpEvents(events.next_offset!)
                  .then((next) =>
                    setEvents({
                      ...next,
                      events: [...events.events, ...next.events],
                    }),
                  )
                  .catch((e) =>
                    setError(apiErrorMessage(e, "โหลดประวัติไม่สำเร็จ")),
                  );
              }}
            >
              ประวัติเพิ่มเติม
            </button>
          )}
        </details>
      )}

      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
