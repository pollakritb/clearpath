import type {
  ReporterAuditHistory,
  ReporterReviewRequest,
  ReporterReviewResult,
} from "@/frontend/types/evidence";
import type {
  AccountPrivacyStatus,
  AccountExportPage,
  PrivacyRequest,
  DeletionRequest,
} from "@/frontend/types/account-privacy";
import { clearAccountData } from "@/frontend/lib/account-data-cache";
import type { OwnedReportIDs } from "@/frontend/types/xp";
import type { XPAdminOverview } from "@/frontend/types/xp";
import type { PublicMember } from "@/frontend/types/xp";
import type {
  XPLeaderboard,
  XPSummary,
  XPSettings,
  XPEventsResponse,
  HelpClaim,
  XPResult,
} from "@/frontend/types/xp";
// typed fetch wrappers — frontend รู้จักแค่ /api/* (same-origin)

import type {
  ForecastGridMetadata,
  ForecastGridFrames,
  LocationLabelResponse,
  MeasurementRequestCreate,
  MeasurementRequestView,
  MeasurementRequestsResponse,
  MeasurementHelperSettings,
  MeasurementHelperLocation,
  MeasurementHelperLocationWrite,
  MeasurementPresenceUpdate,
  ActivitiesResponse,
  AnnouncementsResponse,
  CaptureSessionResponse,
  PhotoMetadata,
  CommunityProfileResponse,
  CommunityMapPointsResponse,
  CommunityReportsResponse,
  CommunityReport,
  FirmsResponse,
  ForecastResponse,
  HistoryResponse,
  MapHistoryResponse,
  LineLinkCodeResponse,
  LineNotificationStatus,
  NotificationPreferences,
  NotificationsResponse,
  OperationResponse,
  ReportCreateResponse,
  ReportComment,
  ReportCommentCreate,
  ReportDraftResponse,
  ReportDraftSubmit,
  ReportEngagementResponse,
  ReportReactionRequest,
  LocationSearchResponse,
  StationsResponse,
  Weather,
} from "@/frontend/types";
import type {
  AdminSyncRunsResponse,
  AuditLogsResponse,
  DataHealthResponse,
  DataIssuesResponse,
  NotificationOutboxSummary,
} from "@/frontend/types/ui";
import { getAccessToken } from "@/frontend/lib/supabase";
import { authenticatedFetch } from "@/frontend/lib/auth-request";
import {
  invalidatePublicData,
  PUBLIC_DATA_KEYS,
} from "@/frontend/lib/public-data-cache";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function apiErrorMessage(error: unknown, fallback: string): string {
  // Keep server diagnostics in the error object; show task-specific recovery copy in UI.
  return error instanceof ApiError &&
    error.status < 500 &&
    !error.message.includes("[object Object]")
    ? error.message
    : fallback;
}

interface HttpOptions extends RequestInit {
  auth?: boolean;
}

async function http<T>(url: string, init?: HttpOptions): Promise<T> {
  const isForm = init?.body instanceof FormData;
  const headers = new Headers(init?.headers);
  if (!isForm && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const request = { ...init, headers };
  const res = init?.auth
    ? await authenticatedFetch(url, request)
    : await fetch(url, request);
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (body?.detail) detail = body.detail;
    } catch {
      /* ignore non-JSON error body */
    }
    throw new ApiError(detail, res.status);
  }
  if (res.status === 204) return undefined as T;
  const result = (await res.json()) as T;
  if (
    init?.auth &&
    (init.method ?? "GET") !== "GET" &&
    (url.endsWith("/submit") || url === "/api/community/me/xp")
  )
    clearAccountData();
  return result;
}

async function invalidateAfter<T>(request: Promise<T>, ...keys: string[]) {
  const result = await request;
  invalidatePublicData(...keys);
  return result;
}

export const api = {
  forecastGridMetadata: () =>
    http<ForecastGridMetadata>("/api/forecast-grid/metadata", {
      cache: "no-store",
    }),
  forecastGridFrames: (
    generation: string,
    start: string,
    end: string,
    bounds: {
      min_lat: number;
      max_lat: number;
      min_lon: number;
      max_lon: number;
    },
    signal?: AbortSignal,
  ) => {
    const params = new URLSearchParams({
      generation_id: generation,
      start,
      end,
      ...Object.fromEntries(
        Object.entries(bounds).map(([k, v]) => [k, String(v)]),
      ),
    });
    return http<ForecastGridFrames>(`/api/forecast-grid/frames?${params}`, {
      signal,
    });
  },
  reverseLocation: (lat: number, lon: number) =>
    http<LocationLabelResponse>(
      `/api/locations/reverse?lat=${lat.toFixed(5)}&lon=${lon.toFixed(5)}`,
      { cache: "no-store" },
    ),
  measurementRequests: () =>
    http<MeasurementRequestsResponse>("/api/measurement-requests", {
      auth: true,
      cache: "no-store",
    }),
  measurementRequest: (id: string) =>
    http<MeasurementRequestView>(
      `/api/measurement-requests/${encodeURIComponent(id)}`,
      { auth: true, cache: "no-store" },
    ),
  createMeasurementRequest: (body: MeasurementRequestCreate) =>
    http<MeasurementRequestView>("/api/measurement-requests", {
      method: "POST",
      auth: true,
      body: JSON.stringify(body),
    }),
  cancelMeasurementRequest: (id: string) =>
    http<MeasurementRequestView>(
      `/api/measurement-requests/${encodeURIComponent(id)}/cancel`,
      { method: "POST", auth: true },
    ),
  declineMeasurementRequest: (id: string) =>
    http<MeasurementRequestView>(
      `/api/measurement-requests/${encodeURIComponent(id)}/decline`,
      { method: "POST", auth: true },
    ),
  measurementHelper: () =>
    http<MeasurementHelperSettings>("/api/measurement-requests/helper", {
      auth: true,
      cache: "no-store",
    }),
  setMeasurementHelper: (enabled: boolean) =>
    http<MeasurementHelperSettings>("/api/measurement-requests/helper", {
      method: "PUT",
      auth: true,
      body: JSON.stringify({ enabled }),
    }),
  saveMeasurementLocation: (
    body: MeasurementHelperLocationWrite,
    slot?: 1 | 2,
  ) =>
    http<MeasurementHelperLocation>(
      `/api/measurement-requests/helper/locations${slot ? `/${slot}` : ""}`,
      {
        method: slot ? "PATCH" : "POST",
        auth: true,
        body: JSON.stringify(body),
      },
    ),
  deleteMeasurementLocation: (slot: 1 | 2) =>
    http<{ ok: boolean }>(
      `/api/measurement-requests/helper/locations/${slot}`,
      { method: "DELETE", auth: true },
    ),
  measurementRequestGroup: (id: string) =>
    http<MeasurementRequestsResponse>(
      `/api/measurement-requests/groups/${encodeURIComponent(id)}`,
      { auth: true, cache: "no-store" },
    ),
  measurementPresence: (body: MeasurementPresenceUpdate) =>
    http<MeasurementHelperSettings>("/api/measurement-requests/presence", {
      method: "PUT",
      auth: true,
      body: JSON.stringify(body),
    }),
  pm25Current: () => http<StationsResponse>("/api/pm25/current"),

  weather: (lat: number, lon: number) =>
    http<Weather>(`/api/weather?lat=${lat}&lon=${lon}`),

  firms: (days = 1) => http<FirmsResponse>(`/api/firms?days=${days}`),

  history: (stationId: string, hours = 24) =>
    http<HistoryResponse>(
      `/api/history?station_id=${encodeURIComponent(stationId)}&hours=${hours}`,
    ),

  mapHistory: (at: string, maxAgeMinutes = 90) => {
    const params = new URLSearchParams({
      at,
      max_age_minutes: String(maxAgeMinutes),
    });
    return http<MapHistoryResponse>(`/api/history/map?${params}`, {
      cache: "no-store",
    });
  },

  forecast: (target: string | { lat: number; lon: number }, hours = 120) => {
    const params = new URLSearchParams({ hours: String(hours) });
    if (typeof target === "string") {
      params.set("station_id", target);
    } else {
      params.set("lat", target.lat.toFixed(2));
      params.set("lon", target.lon.toFixed(2));
    }
    return http<ForecastResponse>(`/api/forecast?${params}`, {
      cache: "no-store",
    });
  },

  communityReports: () =>
    http<CommunityReportsResponse>("/api/community/reports"),

  reportDetail: (id: string, requestId?: string | null) =>
    http<CommunityReport>(
      `/api/community/reports/${encodeURIComponent(id)}${requestId ? `?request_id=${encodeURIComponent(requestId)}` : ""}`,
      {
        cache: "no-store",
        auth: true,
      },
    ),

  communityMapPoints: () =>
    http<CommunityMapPointsResponse>("/api/community/map-points"),

  captureSession: () =>
    http<CaptureSessionResponse>("/api/community/capture-session", {
      method: "POST",
      auth: true,
    }),

  photoMetadata: (file: File) => {
    const body = new FormData();
    body.set("image", file);
    return http<PhotoMetadata>("/api/community/image-metadata", {
      method: "POST",
      auth: true,
      body,
    });
  },

  createReportDraft: (form: FormData) =>
    http<ReportDraftResponse>("/api/community/report-drafts", {
      method: "POST",
      body: form,
      auth: true,
    }),

  submitReportDraft: (draftId: string, body: ReportDraftSubmit) =>
    invalidateAfter(
      http<ReportCreateResponse>(
        `/api/community/report-drafts/${draftId}/submit`,
        {
          method: "POST",
          body: JSON.stringify(body),
          auth: true,
        },
      ),
      PUBLIC_DATA_KEYS.reports,
      PUBLIC_DATA_KEYS.mapPoints,
    ),

  deleteReportDraft: (draftId: string) =>
    http<OperationResponse>(`/api/community/report-drafts/${draftId}`, {
      method: "DELETE",
      auth: true,
    }),

  reportEngagement: (reportId: string) =>
    http<ReportEngagementResponse>(
      `/api/community/reports/${reportId}/engagement`,
    ),

  myReportEngagement: (reportId: string) =>
    http<ReportEngagementResponse>(
      `/api/community/reports/${reportId}/engagement/me`,
      { auth: true },
    ),

  setReportReaction: (reportId: string, body: ReportReactionRequest) =>
    invalidateAfter(
      http<ReportEngagementResponse>(
        `/api/community/reports/${reportId}/reaction`,
        { method: "PUT", body: JSON.stringify(body), auth: true },
      ),
      PUBLIC_DATA_KEYS.reports,
    ),

  clearReportReaction: (reportId: string) =>
    invalidateAfter(
      http<ReportEngagementResponse>(
        `/api/community/reports/${reportId}/reaction`,
        { method: "DELETE", auth: true },
      ),
      PUBLIC_DATA_KEYS.reports,
    ),

  addReportComment: (reportId: string, body: ReportCommentCreate) =>
    invalidateAfter(
      http<ReportComment>(`/api/community/reports/${reportId}/comments`, {
        method: "POST",
        body: JSON.stringify(body),
        auth: true,
      }),
      PUBLIC_DATA_KEYS.reports,
    ),

  removeReportComment: (reportId: string, commentId: string) =>
    invalidateAfter(
      http<OperationResponse>(
        `/api/community/reports/${reportId}/comments/${commentId}`,
        { method: "DELETE", auth: true },
      ),
      PUBLIC_DATA_KEYS.reports,
    ),

  announcements: (offset = 0) =>
    http<AnnouncementsResponse>(
      `/api/community/announcements${offset ? `?offset=${offset}` : ""}`,
    ),

  activities: () => http<ActivitiesResponse>("/api/community/activities"),

  contributionMissions: () =>
    http<import("@/frontend/types").ContributionMissions>(
      "/api/community/missions",
    ),
  leaderboard: (period: string = "month", offset = 0) =>
    http<XPLeaderboard>(
      `/api/community/leaderboard?period=${period}&offset=${offset}`,
    ),
  myLeaderboard: (period: string = "month", offset = 0) =>
    http<XPLeaderboard>(
      `/api/community/me/leaderboard?period=${period}&offset=${offset}`,
      { auth: true, cache: "no-store" },
    ),
  publicMember: (id: string) =>
    http<PublicMember>(`/api/community/members/${encodeURIComponent(id)}`),
  xpAdminOverview: () =>
    http<XPAdminOverview>("/api/community/xp/admin", {
      auth: true,
      cache: "no-store",
    }),
  reporterAudits: (offset = 0) =>
    http<ReporterAuditHistory>(
      `/api/community/me/trust-audits?offset=${offset}`,
      { auth: true, cache: "no-store" },
    ),
  requestTrustReview: (body: ReporterReviewRequest) =>
    http<ReporterReviewResult>("/api/community/me/trust-review", {
      auth: true,
      method: "POST",
      body: JSON.stringify(body),
    }),
  accountPrivacy: () =>
    http<AccountPrivacyStatus>("/api/community/me/privacy", {
      auth: true,
      cache: "no-store",
    }),
  accountExport: (section: string, offset = 0) =>
    http<AccountExportPage>(
      `/api/community/me/data-export?section=${encodeURIComponent(section)}&offset=${offset}`,
      { auth: true, cache: "no-store" },
    ),
  requestDeletion: (body: DeletionRequest) =>
    http<PrivacyRequest>("/api/community/me/deletion-request", {
      auth: true,
      method: "POST",
      body: JSON.stringify(body),
    }),
  xpSummary: () =>
    http<XPSummary | null>("/api/community/me/xp", {
      auth: true,
      cache: "no-store",
    }),
  xpEvents: (offset = 0) =>
    http<XPEventsResponse>(`/api/community/me/xp-events?offset=${offset}`, {
      auth: true,
      cache: "no-store",
    }),
  xpSettings: (body: XPSettings) =>
    http<XPSummary>("/api/community/me/xp", {
      method: "PUT",
      auth: true,
      body: JSON.stringify(body),
    }),
  claimMeasurementHelp: (id: string) =>
    http<HelpClaim>(`/api/community/help-claims/${encodeURIComponent(id)}`, {
      method: "POST",
      auth: true,
    }),
  reportXP: (id: string) =>
    http<XPResult>(`/api/community/me/reports/${encodeURIComponent(id)}/xp`, {
      auth: true,
      cache: "no-store",
    }),
  ownReportIds: () =>
    http<OwnedReportIDs>("/api/community/me/report-ids", {
      auth: true,
      cache: "no-store",
    }),

  notificationPreferences: () =>
    http<NotificationPreferences>("/api/notifications/preferences", {
      auth: true,
    }),

  updateNotificationPreferences: (body: NotificationPreferences) =>
    http<NotificationPreferences>("/api/notifications/preferences", {
      method: "PUT",
      auth: true,
      body: JSON.stringify(body),
    }),

  testNotification: () =>
    http<OperationResponse>("/api/notifications/test", {
      method: "POST",
      auth: true,
    }),

  lineNotificationStatus: () =>
    http<LineNotificationStatus>("/api/notifications/line", { auth: true }),

  createLineLinkCode: () =>
    http<LineLinkCodeResponse>("/api/notifications/line/link-code", {
      method: "POST",
      auth: true,
    }),

  disconnectLine: () =>
    http<OperationResponse>("/api/notifications/line", {
      method: "DELETE",
      auth: true,
    }),

  testLineNotification: () =>
    http<OperationResponse>("/api/notifications/line/test", {
      method: "POST",
      auth: true,
    }),

  notifications: () =>
    http<NotificationsResponse>("/api/notifications", { auth: true }),

  markNotificationRead: (notificationId: string) =>
    http<OperationResponse>(`/api/notifications/${notificationId}/read`, {
      method: "PATCH",
      auth: true,
    }),

  markAllNotificationsRead: () =>
    http<OperationResponse>("/api/notifications/read-all", {
      method: "POST",
      auth: true,
    }),

  searchLocations: (query: string) =>
    http<LocationSearchResponse>(
      `/api/locations/search?q=${encodeURIComponent(query)}`,
    ),

  myProfile: () =>
    http<CommunityProfileResponse>("/api/community/me", { auth: true }),

  adminReports: () =>
    http<CommunityReportsResponse>("/api/admin/reports", {
      auth: true,
    }),

  adminAnnouncements: () =>
    http<AnnouncementsResponse>("/api/admin/announcements", { auth: true }),

  adminSyncRuns: (limit = 50) =>
    http<AdminSyncRunsResponse>(`/api/admin/sync-runs?limit=${limit}`, {
      auth: true,
    }),

  adminDataHealth: () =>
    http<DataHealthResponse>("/api/admin/data-health", { auth: true }),

  adminNotificationOutbox: () =>
    http<NotificationOutboxSummary>("/api/admin/notification-outbox", {
      auth: true,
    }),

  adminDataIssues: (limit = 100) =>
    http<DataIssuesResponse>(`/api/admin/data-issues?limit=${limit}`, {
      auth: true,
    }),

  adminAuditLogs: (limit = 100, offset = 0) =>
    http<AuditLogsResponse>(
      `/api/admin/audit-logs?limit=${limit}&offset=${offset}`,
      { auth: true },
    ),

  downloadAdminAuditLogs: async () => {
    const token = await getAccessToken();
    const headers = new Headers();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const response = await fetch("/api/admin/audit-logs/export", { headers });
    if (!response.ok) {
      throw new ApiError("ส่งออก audit log ไม่สำเร็จ", response.status);
    }
    return response.blob();
  },
};
