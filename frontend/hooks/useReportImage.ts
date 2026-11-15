"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/frontend/lib/api-client";
import type { CommunityReport } from "@/frontend/types";

/** Renew evidence in its original permission/time context; one retry per source URL. */
export function useReportImage({
  report,
  active,
  userId,
  historicalAt,
  requestId,
  refreshPublic,
  refreshHistory,
}: {
  report: CommunityReport | null;
  active: boolean;
  userId: string | null;
  historicalAt: string | null;
  requestId?: string | null;
  refreshPublic: () => Promise<unknown>;
  refreshHistory: (at: Date) => Promise<unknown>;
}) {
  const key = JSON.stringify([
    report?.id,
    report?.image_url,
    userId,
    historicalAt,
    requestId,
  ]);
  const [renewed, setRenewed] = useState<{
    key: string;
    report: CommunityReport;
  } | null>(null);
  const attempted = useRef(new Set<string>());
  const selected = renewed?.key === key ? renewed.report : report;
  const scope = useRef(0);
  useEffect(
    () => () => {
      scope.current += 1;
    },
    [key, active],
  );
  const refreshImage = useCallback(() => {
    if (!active || !selected?.image_url) return;
    const attemptKey = JSON.stringify([key, selected.image_url]);
    if (attempted.current.has(attemptKey)) return;
    attempted.current.add(attemptKey);
    if (attempted.current.size > 20)
      attempted.current.delete(attempted.current.values().next().value!);
    const generation = scope.current;
    const refresh = async () => {
      try {
        if (historicalAt) {
          await refreshHistory(new Date(historicalAt));
        } else if (userId) {
          const next = await api.reportDetail(selected.id, requestId);
          if (generation === scope.current) setRenewed({ key, report: next });
        } else {
          await refreshPublic();
        }
      } catch {
        // An unavailable/removed photo must not keep an expired fallback image.
        if (generation === scope.current)
          setRenewed({ key, report: { ...selected, image_url: null } });
      }
    };
    void refresh();
  }, [
    active,
    selected,
    key,
    historicalAt,
    userId,
    requestId,
    refreshHistory,
    refreshPublic,
  ]);
  useEffect(() => {
    if (!active || !selected?.image_url) return;
    const url = new URL(selected.image_url, window.location.origin);
    const expires = Number(url.searchParams.get("expires"));
    if (!expires) return;
    const renew = () => {
      if (!document.hidden && Date.now() >= expires * 1000) refreshImage();
    };
    const timer = setTimeout(
      renew,
      Math.max(0, expires * 1000 - Date.now() + 50),
    );
    document.addEventListener("visibilitychange", renew);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", renew);
    };
  }, [selected?.image_url, active, refreshImage]);
  return { report: selected, refreshImage };
}
