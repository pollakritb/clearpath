"use client";
import { useEffect, useState } from "react";
import { api } from "@/frontend/lib/api-client";
import type { XPResult, XPSummary } from "@/frontend/types/xp";
export default function ReportXPResult({
  reportId,
  initial,
}: {
  reportId: string;
  initial?: XPResult | null;
}) {
  const [result, setResult] = useState(initial);
  const [summary, setSummary] = useState<XPSummary | null>(null);
  const [rankUp, setRankUp] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;
    async function load() {
      try {
        const reward = await api.reportXP(reportId);
        if (cancelled) return;
        setResult(reward);
        if (reward.status === "pending" && ++attempts < 10) {
          timer = setTimeout(() => void load(), 3000);
          return;
        }
        if (reward.status === "disabled") return;
        const current = await api.xpSummary();
        if (cancelled || !current) return;
        setSummary(current);
        try {
          const key = `cp-xp-rank:v1:${current.member_id}`;
          const previous = JSON.parse(
            sessionStorage.getItem(key) ?? "null",
          ) as { minimum_xp: number } | null;
          if (
            previous &&
            previous.minimum_xp < current.rank.minimum_xp &&
            current.rank.minimum_xp > 0
          )
            setRankUp(true);
          sessionStorage.setItem(key, JSON.stringify(current.rank));
        } catch {
          /* Storage can be disabled in private browsing. */
        }
      } catch {
        if (!cancelled && ++attempts < 10)
          timer = setTimeout(() => void load(), 3000);
      }
    }
    if (initial?.status !== "disabled") void load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [reportId, initial?.status]);
  if (!result || result.status === "disabled") return null;
  return (
    <div
      className={rankUp ? "cp-xp-success cp-xp-rankup" : "cp-xp-success"}
      role="status"
    >
      {result.status === "pending" ? (
        <strong>รายงานสำเร็จ · กำลังบันทึกคะแนน</strong>
      ) : (
        <>
          <strong>
            {result.status === "granted"
              ? `ได้รับ +${result.report_xp + result.help_xp} XP`
              : "รายงานบันทึกแล้ว · ไม่ได้รับ XP"}
          </strong>
          <small>
            {result.report_xp > 0
              ? `รายงาน +${result.report_xp}`
              : result.reason}
            {result.help_xp > 0
              ? ` · ช่วยคำขอ +${result.help_xp}`
              : result.bonus_reason
                ? ` · ${result.bonus_reason}`
                : ""}
          </small>
        </>
      )}
      {summary && (
        <small>
          {rankUp ? "เลื่อนยศเป็น " : ""}
          {summary.rank.label} · {summary.lifetime_xp}
          {summary.rank.next_xp ? `/${summary.rank.next_xp}` : ""} XP · ผลงาน{" "}
          {summary.contribution_days} วัน
        </small>
      )}
    </div>
  );
}
