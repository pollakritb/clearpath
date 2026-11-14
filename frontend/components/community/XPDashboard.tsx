"use client";
import { useCallback, useState } from "react";
import SettingsLink from "@/frontend/components/app/SettingsLink";
import {
  useAuth,
  useCurrentUserId,
} from "@/frontend/components/auth/AuthProvider";
import { useAccountData } from "@/frontend/hooks/useAccountData";
import { api, apiErrorMessage } from "@/frontend/lib/api-client";
import type { XPLeaderboard, XPSummary } from "@/frontend/types/xp";
import { googleReporterProfile } from "@/frontend/lib/reporter-profile";
import RankEmblem from "./RankEmblem";
import ParticipationBadge from "./ParticipationBadge";

type Period = string;
const PERIODS: [Period, string][] = [
  ["month", "เดือนนี้"],
  ["all", "ทั้งหมด"],
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
  const [period, setPeriod] = useState<Period>("month");
  const currentUserId = useCurrentUserId();
  const auth = useAuth();
  const google = googleReporterProfile(auth.user);
  const owner = signedIn ? currentUserId : "guest";
  const summaryQuery = useAccountData<XPSummary | null>(
    owner,
    "xp-overview",
    api.xpOverview,
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
  const selectedMonthDate =
    board?.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(board.month)
      ? new Date(`${board.month}-01T12:00:00+07:00`)
      : null;
  const selectedMonthLabel =
    selectedMonthDate && Number.isFinite(selectedMonthDate.getTime())
      ? selectedMonthDate.toLocaleDateString("th-TH", {
          month: "long",
          year: "numeric",
          timeZone: "Asia/Bangkok",
        })
      : board?.month;
  const seasonNotStarted = Boolean(board?.month && !board.launched_at);
  const launchDate = board?.launched_at ? new Date(board.launched_at) : null;
  const launchMonth =
    launchDate && Number.isFinite(launchDate.getTime())
      ? new Intl.DateTimeFormat("sv-SE", {
          year: "numeric",
          month: "2-digit",
          timeZone: "Asia/Bangkok",
        }).format(launchDate)
      : null;
  const beforeLaunch = Boolean(
    board?.month && launchMonth && board.month < launchMonth,
  );
  const setSummary = summaryQuery.setData;
  const setBoard = boardQuery.setData;
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
      setNotice("บันทึกการแสดงชื่อแล้ว");
      boardQuery.refresh();
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
              <ParticipationBadge rank={summary.rank} />
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
          <div
            className="cp-participation-stats"
            aria-label="สรุปการมีส่วนร่วม"
          >
            <div>
              <strong>{summary.report_count ?? 0}</strong>
              <span>รายงานรับคะแนน</span>
            </div>
            <div>
              <strong>{summary.month_points ?? 0}</strong>
              <span>คะแนนเดือนนี้</span>
            </div>
            <div>
              <strong>{summary.contribution_days}</strong>
              <span>วันที่มีผลงาน</span>
            </div>
          </div>
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
          </details>
        </section>
      )}
      {showBoard && (
        <section className="cp-xp-board" aria-label="อันดับชุมชน">
          <h2>อันดับชุมชน</h2>
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
          {board?.month && (
            <p className="cp-xp-note">
              {selectedMonthLabel}
              {!seasonNotStarted && board.provisional
                ? " · ยังไม่สรุปอันดับ"
                : ""}
            </p>
          )}
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
                    <SettingsLink
                      className="cp-xp-person cp-focus"
                      href={`/members/${user.member_id}`}
                    >
                      <strong>{user.alias}</strong>
                      <ParticipationBadge rank={user.title} />
                    </SettingsLink>
                    <span>
                      {user.xp.toLocaleString()}
                      <small>คะแนน</small>
                    </span>
                  </li>
                ))}
              </ol>
              {board.users.length === 0 && (
                <p className="cp-xp-empty">
                  {seasonNotStarted
                    ? "ยังไม่มีอันดับเดือนนี้"
                    : beforeLaunch
                      ? "ยังไม่มีอันดับเดือนนี้"
                      : "ยังไม่มีผลงานที่ได้รับคะแนน ในช่วงนี้"}
                  {(seasonNotStarted || beforeLaunch) && (
                    <button
                      type="button"
                      className="cp-focus cp-season-all"
                      onClick={() => setPeriod("all")}
                    >
                      ดูคะแนนสะสมทั้งหมด
                    </button>
                  )}
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
      {summaryQuery.error && showProfile && (
        <div role="alert">
          <p>โหลดคะแนนไม่สำเร็จ</p>
          <button type="button" onClick={() => summaryQuery.refresh()}>
            ลองใหม่
          </button>
        </div>
      )}
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
