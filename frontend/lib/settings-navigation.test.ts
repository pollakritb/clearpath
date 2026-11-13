import { describe, expect, it } from "vitest";
import { settingsHref, settingsOrigin } from "./settings-navigation";

describe("settings origin", () => {
  it.each([
    "/",
    "/air",
    "/community",
    "/profile?tab=reports",
    "/requests/REQ-000016#reports",
  ])("preserves internal entry %s", (value) => {
    expect(settingsOrigin(value)).toBe(value);
  });
  it.each([
    null,
    "https://example.com",
    "//example.com",
    "/\\example.com",
    "javascript:alert(1)",
    "/settings",
    "/settings/notifications",
    "/settings/../settings/privacy",
    "/settings?from=/air",
    "/air\n",
  ])("rejects unsafe or looping exit %s", (value) => {
    expect(settingsOrigin(value)).toBeNull();
  });
});

it("keeps the exit when linking to another settings section", () => {
  expect(settingsHref("/settings/privacy", "/profile?tab=reports")).toBe(
    "/settings/privacy?returnTo=%2Fprofile%3Ftab%3Dreports",
  );
  expect(settingsHref("/settings/notifications?returnTo=%2Fair", "/")).toBe(
    "/settings/notifications?returnTo=%2F",
  );
  expect(settingsHref("/profile?tab=reports", "/air")).toBe(
    "/profile?tab=reports&returnTo=%2Fair",
  );
  expect(settingsHref("/requests/REQ-000016", "/air")).toBe(
    "/requests/REQ-000016",
  );
});
