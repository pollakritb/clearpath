import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  accountKey,
  accountSnapshot,
  clearAccountData,
  loadAccountData,
  updateAccountData,
} from "./account-data-cache";
beforeEach(() => {
  clearAccountData();
  vi.useFakeTimers();
});
afterEach(() => {
  clearAccountData();
  vi.useRealTimers();
});
it("shares concurrent reads and reuses data when a page reopens", async () => {
  const key = accountKey("one", "reports");
  const loader = vi.fn(async () => ({ count: 3 }));
  const [a, b] = await Promise.all([
    loadAccountData(key, loader),
    loadAccountData(key, loader),
  ]);
  expect(a).toEqual(b);
  await loadAccountData(key, loader);
  expect(loader).toHaveBeenCalledTimes(1);
});
it("never exposes another account's cached reports", async () => {
  await loadAccountData(accountKey("one", "reports"), async () => ({
    private: "one",
  }));
  expect(accountSnapshot(accountKey("two", "reports")).data).toBeUndefined();
});
it("keeps stale content available while refreshing in the background", async () => {
  const key = accountKey("one", "summary");
  await loadAccountData(key, async () => 1);
  await vi.advanceTimersByTimeAsync(60_001);
  let finish: (value: number) => void = () => undefined;
  const read = loadAccountData(
    key,
    () =>
      new Promise<number>((resolve) => {
        finish = resolve;
      }),
  );
  await Promise.resolve();
  expect(accountSnapshot(key).data).toBe(1);
  finish(2);
  await read;
  expect(accountSnapshot(key).data).toBe(2);
});
it("ignores a response from a login that has been cleared", async () => {
  const key = accountKey("one", "reports");
  let finish: (value: string) => void = () => undefined;
  const old = loadAccountData(
    key,
    () =>
      new Promise<string>((resolve) => {
        finish = resolve;
      }),
  );
  await Promise.resolve();
  clearAccountData();
  finish("private old data");
  await old;
  expect(accountSnapshot(key).data).toBeUndefined();
});
it("does not let a late read overwrite updated settings", async () => {
  const key = accountKey("one", "settings");
  let finish: (value: string) => void = () => undefined;
  const old = loadAccountData(
    key,
    () =>
      new Promise<string>((resolve) => {
        finish = resolve;
      }),
  );
  await Promise.resolve();
  updateAccountData(key, "new alias");
  finish("old alias");
  await old;
  expect(accountSnapshot(key).data).toBe("new alias");
});
it("leaves the loading state after a timeout and allows retry", async () => {
  const key = accountKey("one", "leaderboard");
  const read = loadAccountData(key, () => new Promise(() => undefined));
  const rejected = expect(read).rejects.toThrow("โหลดข้อมูลนานเกินไป");
  await vi.advanceTimersByTimeAsync(15_000);
  await rejected;
  expect(accountSnapshot(key).pending).toBeUndefined();
  expect(accountSnapshot(key).error).toBeTruthy();
  await loadAccountData(key, async () => ({ users: [] }));
  expect(accountSnapshot(key).data).toEqual({ users: [] });
});
