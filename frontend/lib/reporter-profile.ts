import type { CommunityReport } from "@/frontend/types";

interface AuthIdentity {
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
}

export interface GoogleReporterProfile {
  displayName: string | null;
  avatarUrl: string | null;
}

export function safeGoogleAvatarUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    if (
      url.protocol !== "https:" ||
      !(
        hostname === "googleusercontent.com" ||
        hostname.endsWith(".googleusercontent.com")
      )
    ) {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}

export function googleReporterProfile(
  user: AuthIdentity | null,
): GoogleReporterProfile | null {
  if (user?.app_metadata?.provider !== "google") return null;
  const metadata = user.user_metadata ?? {};
  const nameCandidate =
    metadata.full_name ?? metadata.name ?? metadata.display_name;
  const displayName =
    typeof nameCandidate === "string" && nameCandidate.trim()
      ? nameCandidate.trim().slice(0, 80)
      : null;
  const avatarUrl = safeGoogleAvatarUrl(
    metadata.avatar_url ?? metadata.picture,
  );
  return displayName || avatarUrl ? { displayName, avatarUrl } : null;
}

export function publicReporterAvatar(
  report: Pick<
    CommunityReport,
    "show_reporter_profile" | "reporter_avatar_url" | "source_type"
  >,
) {
  if (report.source_type !== "individual" || !report.show_reporter_profile) {
    return null;
  }
  return safeGoogleAvatarUrl(report.reporter_avatar_url);
}
