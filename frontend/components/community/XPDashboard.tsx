"use client";
import { useCallback, useState } from "react";
import Link from "next/link";
import {
  useAuth,
  useCurrentUserId,
} from "@/frontend/components/auth/AuthProvider";
import { useAccountData } from "@/frontend/hooks/useAccountData";
import { api, apiErrorMessage } from "@/frontend/lib/api-client";
import type {
  XPEventsResponse,
  XPLeaderboard,
  XPSummary,
} from "@/frontend/types/xp";
import { googleReporterProfile } from "@/frontend/lib/reporter-profile";
import RankEmblem from "./RankEmblem";
import ParticipationBadge from "./ParticipationBadge";
import RankDetails from "./RankDetails";

type Period = "all" | "7d" | "30d";
const PERIODS: [Period, string][] = [
  ["all", "ทั้งหมด"],
  ["7d", "7 วัน"],
  ["30d", "30 วัน"],
];

export default function XPDashboard({
  signedIn = true,
  section = "all",
  active = true,
}: {
  signedIn?: boolean;
  active?: boolean;
  section?: "all" | "overview" | "leaderboard";
}) {
  const showProfile = section !== "leaderboard";
  const showBoard = section !== "overview";
  const [period, setPeriod] = useState<Period>("all");
  const currentUserId = useCurrentUserId();
  const auth = useAuth();
  const google = googleReporterProfile(auth.user);
  const owner = signedIn ? currentUserId : "guest";
  const summaryQuery = useAccountData<XPSummary | null>(
    owner,
    "xp-summary",
    api.xpSummary,
    active && signedIn && showProfile,
  );
  const eventsLoader = useCallback(() => api.xpEvents(), []);
  const eventsQuery = useAccountData<XPEventsResponse>(
    owner,
    "xp-events",
    eventsLoader,
    active && signedIn && showProfile,
  );
  const boardLoader = useCallback(
    () => (signedIn ? api.myLeaderboard(period) : api.leaderboard(period)),
    [signedIn, period],
  );
  const boardQuery = useAccountData<XPLeaderboard>(
    owner,
    `xp-board:${period}`,
    boardLoader,
    active && showBoard,
  );
  const summary = summaryQuery.data;
  const profileLoaded = summary !== undefined;
  const board = boardQuery.data;
  const events = eventsQuery.data;
  const setSummary = summaryQuery.setData;
  const setBoard = boardQuery.setData;
  const setEvents = eventsQuery.setData;
  const [draftSettings, setDraftSettings] = useState<{
    alias: string;
    hidden: boolean;
    identity_mode: "google" | "alias";
  } | null>(null);
  const alias = draftSettings?.alias ?? summary?.alias ?? "";
  const hidden = draftSettings?.hidden ?? summary?.hidden ?? false;
  const identityMode =
    draftSettings?.identity_mode ?? summary?.identity_mode ?? "google";
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [notice, setNotice] = useState("");
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
      const s = await api.xpSettings({
        alias,
        hidden,
        identity_mode: identityMode,
      });
      setSummary(s);
      setDraftSettings(null);
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
      {showProfile &&
        signedIn &&
        !profileLoaded &&
        !error &&
        !summaryQuery.error && (
          <p className="cp-xp-note" role="status">
            กำลังโหลดผลงาน…
          </p>
        )}
      {showProfile && signedIn && profileLoaded && !summary && (
        <p className="cp-xp-note" role="status">
          ระบบคะแนนกำลังเตรียมเปิดใช้ คุณยังรายงานค่าฝุ่นได้ตามปกติ
        </p>
      )}
      {showProfile && summary && (
        <section className="cp-xp-profile" aria-label="คะแนนและยศของฉัน">
          <span className="cp-xp-eyebrow">การมีส่วนร่วมของคุณ</span>
          <div className="cp-xp-profile-heading">
            <span className="cp-xp-profile-avatar" aria-hidden="true">
              {summary.identity_mode === "google" && google?.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={google.avatarUrl}
                  alt=""
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span>
                  {
                    Array.from(
                      summary.identity_mode === "google"
                        ? (google?.displayName ?? summary.alias)
                        : summary.alias,
                    )[0]
                  }
                </span>
              )}
              <RankEmblem rank={summary.rank} decorative />
            </span>
            <div>
              <h2>
                {summary.identity_mode === "google"
                  ? (google?.displayName ?? summary.alias)
                  : summary.alias}
              </h2>
              <RankDetails
                rank={summary.rank}
                xp={summary.lifetime_xp}
                active={active}
              />
            </div>
          </div>
          <p className="cp-xp-total">
            {summary.lifetime_xp.toLocaleString()} <small>คะแนนสะสม</small>
          </p>
          {summary.rank.next_xp ? (
            <>
              <progress
                aria-label="ความคืบหน้าคะแนนสำหรับยศถัดไป"
                value={Math.min(summary.lifetime_xp, summary.rank.next_xp)}
                max={summary.rank.next_xp}
              />
              <p className="cp-xp-note">
                ยศถัดไป {summary.rank.next_label} · {summary.lifetime_xp}/
                {summary.rank.next_xp} คะแนน
              </p>
            </>
          ) : (
            <p>คุณได้รับยศสูงสุดแล้ว</p>
          )}
          <p className="cp-xp-note">
            เลื่อนยศตามคะแนนสะสมเท่านั้น ไม่กำหนดจำนวนวัน
          </p>
          <div
            className="cp-participation-stats"
            aria-label="สรุปการมีส่วนร่วม"
          >
            <div>
              <strong>{summary.report_count ?? 0}</strong>
              <span>รายงานรับคะแนน</span>
            </div>
            <div>
              <strong>{summary.help_count ?? 0}</strong>
              <span>ช่วยคำขอ</span>
            </div>
            <div>
              <strong>{summary.contribution_days}</strong>
              <span>วันที่มีผลงาน</span>
            </div>
          </div>
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
            <summary>ชื่อที่แสดงในอันดับ</summary>
            <label>
              แสดงตัวตนในอันดับและโปรไฟล์ชุมชน
              <select
                value={identityMode}
                onChange={(event) =>
                  setDraftSettings({
                    alias,
                    hidden,
                    identity_mode: event.target.value as "google" | "alias",
                  })
                }
              >
                <option value="google">ชื่อ Google (ค่าเริ่มต้น)</option>
                <option value="alias">ปิดบังตัวตน · ใช้ชื่อเล่น</option>
              </select>
            </label>
            <label>
              นามแฝง ClearPath
              <input
                maxLength={40}
                minLength={3}
                value={alias}
                onChange={(e) =>
                  setDraftSettings({
                    alias: e.target.value,
                    hidden,
                    identity_mode: identityMode,
                  })
                }
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
                onChange={(e) =>
                  setDraftSettings({
                    alias,
                    hidden: e.target.checked,
                    identity_mode: identityMode,
                  })
                }
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
              ใช้ชื่อเล่นแล้วจะไม่แสดงชื่อ Google ในอันดับ
              การปิดบังในแต่ละรายงานเลือกแยกได้ และได้รับคะแนน เท่าเดิม
            </p>
          </details>
        </section>
      )}
      {showBoard && (
        <section className="cp-xp-board" aria-label="อันดับชุมชน">
          <h2>อันดับชุมชน</h2>
          <p className="cp-xp-note">
            อันดับการมีส่วนร่วม ไม่ใช่อันดับความแม่นยำของข้อมูล
          </p>
          <div
            className="cp-xp-periods"
            role="group"
            aria-label="ช่วงเวลาอันดับ"
          >
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
            boardQuery.error ? (
              <div role="alert">
                <p>โหลดอันดับไม่สำเร็จ</p>
                <button type="button" onClick={() => boardQuery.refresh()}>
                  ลองใหม่
                </button>
              </div>
            ) : (
              <p role="status">กำลังโหลดอันดับ…</p>
            )
          ) : (
            <>
              {signedIn && (
                <p className="cp-xp-self">
                  อันดับของฉัน <strong>{board.me?.rank ?? "—"}</strong>
                  <span>
                    {board.me?.xp ?? 0} คะแนน
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
                      <RankEmblem rank={user.title} decorative />
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
                      <small>คะแนน</small>
                    </span>
                  </li>
                ))}
              </ol>
              {board.users.length === 0 && (
                <p className="cp-xp-empty">
                  ยังไม่มีผลงานที่ได้รับคะแนน ในช่วงนี้
                </p>
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
      )}
      {showProfile && (
        <details>
          <summary>กติกาคะแนน</summary>
          <p>
            รายงานที่อนุมัติ +10 คะแนน สูงสุด 5 ครั้งต่อวัน · ช่วยคำขอ +5 คะแนน
            สูงสุด 3 ครั้งต่อวัน
          </p>
          <p>
            รายงานที่รับคะแนนห่างกัน 30 นาที · สูงสุด 65 คะแนน ต่อวันตามเวลาไทย
            · คะแนนและยศสะสมตลอดอายุบัญชี
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
            นาทีหลังสำเร็จ แล้วแต่ว่าเวลาใดถึงก่อน การไม่เข้าเกณฑ์คะแนน
            ไม่ปิดกั้นรายงานที่ผ่านระบบตรวจเดิม
          </p>
          <p>
            ไม่มีคะแนน จากการให้ดาว ไลก์ หรือสร้างคำขอ · ไม่เพิ่มน้ำหนัก Trust
            หรือค่าฝุ่น
          </p>
        </details>
      )}
      {showProfile && signedIn && (
        <details>
          <summary>ประวัติคะแนนส่วนตัว</summary>
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
                {event.points} คะแนน
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

      {summaryQuery.error && showProfile && (
        <div role="alert">
          <p>โหลดคะแนนไม่สำเร็จ</p>
          <button type="button" onClick={() => summaryQuery.refresh()}>
            ลองใหม่
          </button>
        </div>
      )}
      {eventsQuery.error && showProfile && (
        <div role="alert">
          <p>โหลดประวัติคะแนนไม่สำเร็จ</p>
          <button type="button" onClick={() => eventsQuery.refresh()}>
            ลองใหม่
          </button>
        </div>
      )}
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
