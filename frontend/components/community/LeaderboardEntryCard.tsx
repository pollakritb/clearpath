"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import AppIcon from "@/frontend/components/ui/AppIcon";
import { api } from "@/frontend/lib/api-client";
import type { XPSummary } from "@/frontend/types/xp";
import ParticipationBadge from "./ParticipationBadge";

export default function LeaderboardEntryCard({
  userId,
}: {
  userId: string | null;
}) {
  const [loaded, setLoaded] = useState<{
    userId: string;
    summary: XPSummary | null;
  } | null>(null);
  const summary = loaded?.userId === userId ? loaded?.summary : null;

  useEffect(() => {
    if (!userId) return;
    let active = true;
    let sequence = 0;
    const refresh = async () => {
      if (document.visibilityState === "hidden") return;
      const request = ++sequence;
      try {
        const summary = await api.xpSummary();
        if (active && request === sequence) setLoaded({ userId, summary });
      } catch {
        // The entry stays usable when XP is temporarily unavailable.
      }
    };
    void refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [userId]);

  return (
    <Link href="/leaderboard" className="cp-leaderboard-entry cp-focus">
      <span className="cp-leaderboard-entry__icon" aria-hidden="true">
        <AppIcon name="community" size={21} />
      </span>
      <span className="cp-leaderboard-entry__copy">
        <strong>อันดับชุมชน</strong>
        <span className="cp-leaderboard-entry__detail">
          {summary ? (
            <>
              <ParticipationBadge rank={summary.rank} />
              <span>{summary.lifetime_xp.toLocaleString("th-TH")} XP</span>
            </>
          ) : (
            <span>ดูอันดับ ยศ และคะแนนการมีส่วนร่วม</span>
          )}
        </span>
      </span>
      <AppIcon name="chevron" size={18} />
    </Link>
  );
}
