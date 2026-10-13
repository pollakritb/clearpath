import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  cachedPublicValue,
  clearPublicDataCache,
  invalidatePublicData,
  loadPublicData,
} from "./public-data-cache";

describe("public data cache", () => {
  beforeEach(() => {
    clearPublicDataCache();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-11T00:00:00Z"));
  });

  afterEach(() => {
    clearPublicDataCache();
    vi.useRealTimers();
  });

  it("shares in-flight requests and skips a second fetch until TTL expires", async () => {
    const fetcher = vi.fn().mockResolvedValue({ count: 1 });
    const first = loadPublicData("stations", 60_000, fetcher);
    const second = loadPublicData("stations", 60_000, fetcher);
    expect(first).toBe(second);
    await first;
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(await loadPublicData("stations", 60_000, fetcher)).toEqual({
      count: 1,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60_000);
    await loadPublicData("stations", 60_000, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("forces manual refresh and does not cache failed responses", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ count: 2 });
    await loadPublicData("stations", 60_000, fetcher);
    await expect(
      loadPublicData("stations", 60_000, fetcher, true),
    ).rejects.toThrow("offline");
    expect(cachedPublicValue("stations")).toEqual({ count: 1 });
    await loadPublicData("stations", 60_000, fetcher, true);
    expect(cachedPublicValue("stations")).toEqual({ count: 2 });
  });

  it("invalidation prevents an older in-flight response replacing new data", async () => {
    let resolveOld!: (value: { count: number }) => void;
    const old = loadPublicData(
      "reports",
      60_000,
      () =>
        new Promise<{ count: number }>((resolve) => {
          resolveOld = resolve;
        }),
    );
    invalidatePublicData("reports");
    await loadPublicData("reports", 60_000, async () => ({ count: 2 }));
    resolveOld({ count: 1 });
    await old;
    expect(cachedPublicValue("reports")).toEqual({ count: 2 });
  });
});
