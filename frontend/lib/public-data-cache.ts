/** Short-lived, tab-local cache for public API responses across page navigation. */
const entries = new Map<string, { value: unknown; expiresAt: number }>();
const pending = new Map<string, Promise<unknown>>();
const versions = new Map<string, number>();

export const PUBLIC_DATA_KEYS = {
  pm25: "pm25-current",
  reports: "community-reports",
  mapPoints: "community-map-points",
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

  const version = versions.get(key) ?? 0;
  const request = fetcher()
    .then((value) => {
      if ((versions.get(key) ?? 0) === version) {
        entries.set(key, { value, expiresAt: Date.now() + ttlMs });
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
    versions.set(key, (versions.get(key) ?? 0) + 1);
  }
}

/** Test helper: never persist public or authenticated responses across test cases. */
export function clearPublicDataCache() {
  entries.clear();
  pending.clear();
  versions.clear();
}
