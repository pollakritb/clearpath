"use client";
import { useSyncExternalStore } from "react";
import {
  emptySearchHistory,
  rememberSearch,
  removeSearchHistory,
  searchHistoryKey,
  searchHistorySnapshot,
  subscribeSearchHistory,
} from "@/frontend/lib/search-history";
import type { SearchHistoryEntry } from "@/frontend/types/ui";
export function useSearchHistory(owner: string | null) {
  const key = searchHistoryKey(owner);
  const entries = useSyncExternalStore(
    subscribeSearchHistory,
    () => searchHistorySnapshot(key),
    emptySearchHistory,
  );
  return {
    entries,
    remember: (entry: Omit<SearchHistoryEntry, "selectedAt">) =>
      rememberSearch(key, entry),
    remove: (entryKey?: string) => removeSearchHistory(key, entryKey),
  };
}
