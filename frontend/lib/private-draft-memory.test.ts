import { afterEach, expect, it, vi } from "vitest";
import { clearAccountData } from "./account-data-cache";
import {
  clearPrivateDrafts,
  readPrivateDraft,
  writePrivateDraft,
} from "./private-draft-memory";
afterEach(() => {
  clearPrivateDrafts();
  vi.useRealTimers();
});
it("expires private drafts and never crosses account keys", () => {
  vi.useFakeTimers();
  writePrivateDraft("account-a/report", { evidence: "private" });
  expect(readPrivateDraft("account-b/report")).toBeNull();
  expect(readPrivateDraft("account-a/report")).toEqual({ evidence: "private" });
  vi.advanceTimersByTime(30 * 60_000);
  expect(readPrivateDraft("account-a/report")).toBeNull();
});
it("clears draft memory with account/session cache invalidation", () => {
  writePrivateDraft("account-a/report", { evidence: "private" });
  clearAccountData(true);
  expect(readPrivateDraft("account-a/report")).toBeNull();
});

it("preserves unsent drafts when refreshing scores or identity settings", () => {
  writePrivateDraft("account-a/report", { evidence: "private" });
  clearAccountData();
  expect(readPrivateDraft("account-a/report")).toEqual({ evidence: "private" });
});

it("actively releases expired draft entries without another read", () => {
  vi.useFakeTimers();
  writePrivateDraft(
    "account-a/report",
    { evidence: "private" },
    Date.now() + 1000,
  );
  vi.advanceTimersByTime(1000);
  expect(vi.getTimerCount()).toBe(0);
  expect(readPrivateDraft("account-a/report")).toBeNull();
});
it("an older expiry cannot discard a replacement draft", () => {
  vi.useFakeTimers();
  writePrivateDraft("account-a/report", "old", Date.now() + 1000);
  vi.advanceTimersByTime(500);
  writePrivateDraft("account-a/report", "new", Date.now() + 1000);
  vi.advanceTimersByTime(500);
  expect(readPrivateDraft("account-a/report")).toBe("new");
  clearPrivateDrafts();
  expect(vi.getTimerCount()).toBe(0);
});
