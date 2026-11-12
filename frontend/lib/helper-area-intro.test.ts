import { beforeEach, expect, it, vi } from "vitest";
import {
  shouldOfferHelperAreas,
  deferredHelperAreaRequest,
  rememberHelperAreaIntro,
} from "./helper-area-intro";
beforeEach(() => localStorage.clear());
it("offers a new account, snoozes for three days and keeps accounts separate", () => {
  const now = 1000;
  expect(shouldOfferHelperAreas("a", now)).toBe(true);
  rememberHelperAreaIntro("a", "later", now);
  expect(shouldOfferHelperAreas("a", now + 2 * 86400000)).toBe(false);
  expect(shouldOfferHelperAreas("a", now + 3 * 86400000)).toBe(true);
  expect(shouldOfferHelperAreas("b", now)).toBe(true);
});
it("remembers setup and never choices across reads", () => {
  rememberHelperAreaIntro("setup", "setup");
  rememberHelperAreaIntro("never", "never");
  expect(shouldOfferHelperAreas("setup")).toBe(false);
  expect(shouldOfferHelperAreas("never")).toBe(false);
});
it("uses memory when browser storage is blocked", () => {
  const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  rememberHelperAreaIntro("blocked", "never");
  expect(shouldOfferHelperAreas("blocked")).toBe(false);
  spy.mockRestore();
});

it("returns the snoozed request only after three days", () => {
  rememberHelperAreaIntro("snooze-request", "later", 1000, "REQ-INTRO");
  expect(deferredHelperAreaRequest("snooze-request", 2000)).toBeNull();
  expect(deferredHelperAreaRequest("snooze-request", 1000 + 3 * 86400000)).toBe(
    "REQ-INTRO",
  );
});
