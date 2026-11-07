import type { SearchHistoryEntry } from "@/frontend/types/ui";

const PREFIX = "clearpath:search-history:v1:";
const EMPTY: SearchHistoryEntry[] = [];
const cache = new Map<string, SearchHistoryEntry[]>();
const listeners = new Set<() => void>();
export const searchHistoryKey = (owner: string | null) =>
  PREFIX + JSON.stringify(owner ?? "guest");
function valid(value: unknown): value is SearchHistoryEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as SearchHistoryEntry,
    place = entry.location;
  return (
    typeof entry.key === "string" &&
    entry.key.length < 400 &&
    (entry.kind === "place" || entry.kind === "station") &&
    (entry.kind !== "station" ||
      (typeof entry.stationId === "string" && entry.stationId.length < 100)) &&
    Number.isFinite(entry.selectedAt) &&
    Boolean(place) &&
    typeof place.id === "string" &&
    place.id.length < 200 &&
    typeof place.name === "string" &&
    place.name.length > 0 &&
    place.name.length <= 160 &&
    typeof place.kind === "string" &&
    typeof place.address === "string" &&
    place.address.length <= 500 &&
    Number.isFinite(place.lat) &&
    Math.abs(place.lat) <= 90 &&
    Number.isFinite(place.lon) &&
    Math.abs(place.lon) <= 180 &&
    ["local", "geoapify", "photon", "openstreetmap"].includes(place.source)
  );
}
export function searchHistorySnapshot(key: string): SearchHistoryEntry[] {
  if (typeof window === "undefined") return EMPTY;
  const existing = cache.get(key);
  if (existing) return existing;
  let entries: SearchHistoryEntry[] = [];
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    if (Array.isArray(raw)) entries = raw.filter(valid).slice(0, 10);
  } catch {
    /* Storage may be unavailable. */
  }
  cache.set(key, entries);
  return entries;
}
export const emptySearchHistory = () => EMPTY;
function write(key: string, entries: SearchHistoryEntry[]) {
  cache.set(key, entries);
  try {
    if (entries.length) localStorage.setItem(key, JSON.stringify(entries));
    else localStorage.removeItem(key);
  } catch {
    /* Session memory remains useful when storage is blocked. */
  }
  listeners.forEach((listener) => listener());
}
export function rememberSearch(
  key: string,
  entry: Omit<SearchHistoryEntry, "selectedAt">,
) {
  const next = { ...entry, selectedAt: Date.now() };
  if (valid(next))
    write(
      key,
      [
        next,
        ...searchHistorySnapshot(key).filter((item) => item.key !== entry.key),
      ].slice(0, 10),
    );
}
export function removeSearchHistory(key: string, entryKey?: string) {
  write(
    key,
    entryKey
      ? searchHistorySnapshot(key).filter((item) => item.key !== entryKey)
      : [],
  );
}
function changed(event: StorageEvent) {
  if (event.key && !event.key.startsWith(PREFIX)) return;
  if (event.key) cache.delete(event.key);
  else cache.clear();
  listeners.forEach((listener) => listener());
}
export function subscribeSearchHistory(listener: () => void) {
  if (!listeners.size) window.addEventListener("storage", changed);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) window.removeEventListener("storage", changed);
  };
}
