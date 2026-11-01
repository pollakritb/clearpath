"use client";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import {
  accountDataGeneration,
  accountKey,
  accountSnapshot,
  emptyAccountSnapshot,
  loadAccountData,
  subscribeAccountData,
  updateAccountData,
} from "@/frontend/lib/account-data-cache";

export function useAccountData<T>(
  owner: string | null,
  resource: string,
  loader: () => Promise<T>,
  enabled = true,
) {
  const revision = accountDataGeneration();
  const key = accountKey(owner ?? "guest", resource);
  const getSnapshot = useCallback(() => accountSnapshot<T>(key), [key]);
  const snapshot = useSyncExternalStore(
    subscribeAccountData,
    getSnapshot,
    emptyAccountSnapshot,
  );
  const refresh = useCallback(
    (force = true) => {
      if (owner && enabled)
        void loadAccountData(key, loader, force).catch(() => undefined);
    },
    [owner, enabled, key, loader],
  );
  useEffect(() => {
    if (!owner || !enabled) return;
    refresh(false);
    const visible = () => {
      if (document.visibilityState !== "hidden") refresh(false);
    };
    window.addEventListener("focus", visible);
    document.addEventListener("visibilitychange", visible);
    const timer = window.setInterval(visible, 60_000);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", visible);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [owner, enabled, refresh, revision]);
  const setData = useCallback(
    (value: T | ((previous: T | undefined) => T | undefined)) => {
      if (revision === accountDataGeneration()) updateAccountData(key, value);
    },
    [key, revision],
  );
  return {
    ...snapshot,
    loading:
      enabled &&
      Boolean(
        snapshot.pending || (snapshot.data === undefined && !snapshot.error),
      ),
    refresh,
    setData,
  };
}
