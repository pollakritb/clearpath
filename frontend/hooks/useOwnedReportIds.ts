"use client";
import { useEffect, useState } from "react";
import { api } from "@/frontend/lib/api-client";
const EMPTY = new Set<string>();
/** Ownership is fetched privately; anonymous public data cannot identify an account. */
export function useOwnedReportIds(userId: string | null, revision: unknown) {
  const [owned, setOwned] = useState<{
    userId: string;
    ids: Set<string>;
  } | null>(null);
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void api
      .ownReportIds()
      .then((result) => {
        if (!cancelled) setOwned({ userId, ids: new Set(result.ids) });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [userId, revision]);
  return {
    ids: owned?.userId === userId ? owned.ids : EMPTY,
    ready: !userId || owned?.userId === userId,
  };
}
