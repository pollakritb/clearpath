/** Short-lived, tab-local cache for public API responses across page navigation. */
const entries = new Map<string, { value: unknown; expiresAt: number }>();
const pending = new Map<string, Promise<unknown>>();
const MAX_ENTRIES = 80;

export const PUBLIC_DATA_KEYS = {
  pm25: "pm25-current",
  reports: "community-reports",
  announcements: "announcements",
} as const;

export function cachedPublicValue<T>(key: string): T | null {
  const entry = entries.get(key);
  if (!entry) return null;
  if (Date.now() >= entry.expiresAt) {
    entries.delete(key);
    return null;
  }
  return entry.value as T;
}

export function loadPublicData<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
  force = false,
): Promise<T> {
  if (!force) {
    const cached = cachedPublicValue<T>(key);
    if (cached !== null) return Promise.resolve(cached);
  }
  const existing = pending.get(key);
  if (existing) return existing as Promise<T>;

  const request = fetcher()
    .then((value) => {
      if (pending.get(key) === request) {
        const now = Date.now();
        for (const [id, entry] of entries) {
          if (entry.expiresAt <= now) entries.delete(id);
        }
        entries.delete(key);
        entries.set(key, { value, expiresAt: now + ttlMs });
        while (entries.size > MAX_ENTRIES)
          entries.delete(entries.keys().next().value!);
      }
      return value;
    })
    .finally(() => {
      if (pending.get(key) === request) pending.delete(key);
    });
  pending.set(key, request);
  return request;
}

export function invalidatePublicData(...keys: string[]) {
  for (const key of keys) {
    entries.delete(key);
    pending.delete(key);
  }
}

/** Test helper: never persist public or authenticated responses across test cases. */
export function clearPublicDataCache() {
  entries.clear();
  pending.clear();
}
