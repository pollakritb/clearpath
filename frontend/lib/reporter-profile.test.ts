import { describe, expect, it } from "vitest";

import {
  googleReporterProfile,
  publicReporterAvatar,
  safeGoogleAvatarUrl,
} from "./reporter-profile";

describe("reporter profile privacy", () => {
  it("accepts only HTTPS Google avatar hosts", () => {
    expect(
      safeGoogleAvatarUrl("https://lh3.googleusercontent.com/a/example"),
    ).toBe("https://lh3.googleusercontent.com/a/example");
    expect(
      safeGoogleAvatarUrl("http://lh3.googleusercontent.com/a/example"),
    ).toBeNull();
    expect(safeGoogleAvatarUrl("https://example.com/avatar.png")).toBeNull();
  });

  it("reads a profile only for Google identities", () => {
    expect(
      googleReporterProfile({
        app_metadata: { provider: "google" },
        user_metadata: {
          full_name: "ผู้รายงาน Google",
          picture: "https://lh3.googleusercontent.com/a/example",
        },
      }),
    ).toEqual({
      displayName: "ผู้รายงาน Google",
      avatarUrl: "https://lh3.googleusercontent.com/a/example",
    });
    expect(
      googleReporterProfile({
        app_metadata: { provider: "email" },
        user_metadata: { full_name: "Not Google" },
      }),
    ).toBeNull();
  });

  it("returns a marker avatar only after per-report opt-in", () => {
    const report = {
      source_type: "individual" as const,
      reporter_avatar_url: "https://lh3.googleusercontent.com/a/example",
      show_reporter_profile: false,
    };
    expect(publicReporterAvatar(report)).toBeNull();
    expect(
      publicReporterAvatar({ ...report, show_reporter_profile: true }),
    ).toBe("https://lh3.googleusercontent.com/a/example");
  });
});
