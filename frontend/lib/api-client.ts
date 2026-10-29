// typed fetch wrappers — frontend รู้จักแค่ /api/* (same-origin)

import type {
  MeasurementRequestCreate,
  MeasurementRequestView,
  MeasurementRequestsResponse,
  MeasurementHelperSettings,
  MeasurementPresenceUpdate,
  ActivitiesResponse,
  Activity,
  ActivityCreate,
  Announcement,
  AnnouncementCreate,
  AnnouncementUpdate,
  AnnouncementsResponse,
  CaptureSessionResponse,
  PhotoMetadata,
  CommunityProfileResponse,
  CommunityMapPointsResponse,
  CommunityReportsResponse,
  DataIssueCreate,
  FirmsResponse,
  ForecastResponse,
  HistoryResponse,
  MapHistoryResponse,
  LineLinkCodeResponse,
  LineNotificationStatus,
  NotificationPreferences,
  NotificationsResponse,
  OperationResponse,
  LeaderboardResponse,
  ReportCreateResponse,
  ReportComment,
  ReportCommentCreate,
  ReportDraftResponse,
  ReportDraftSubmit,
  ReportRatingRequest,
  ReportEngagementResponse,
  ReportReactionRequest,
  RatingResult,
  LocationSearchResponse,
  StationsResponse,
  Weather,
} from "@/frontend/types";
import type {
  AdminSyncRunsResponse,
  AuditLogsResponse,
  DataHealthResponse,
  DataIssueRow,
  DataIssueUpdateRequest,
  DataIssuesResponse,
  ForecastDataQualityResponse,
  ForecastEvaluationResponse,
  ForecastFalseSafeCasesResponse,
  ForecastFalseSafeReviewRequest,
  ForecastReleaseDecisionsResponse,
  ForecastModelStatusesResponse,
  ForecastProviderHealthResponse,
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
  return error instanceof ApiError ? error.message : fallback;
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
  return (await res.json()) as T;
}

async function invalidateAfter<T>(request: Promise<T>, ...keys: string[]) {
  const result = await request;
  invalidatePublicData(...keys);
  return result;
}

export const api = {
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

  communityMapPoints: () =>
    http<CommunityMapPointsResponse>("/api/community/map-points"),

  reportDataIssue: (body: DataIssueCreate) =>
    http<OperationResponse>("/api/community/data-issues", {
      method: "POST",
      body: JSON.stringify(body),
      auth: true,
    }),

  captureSession: () =>
    http<CaptureSessionResponse>("/api/community/capture-session", {
      method: "POST",
      auth: true,
    }),

  reviewQueue: (lat: number, lon: number) =>
    http<CommunityReportsResponse>(
      `/api/community/review-queue?lat=${lat}&lon=${lon}`,
      { auth: true },
    ),

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

  rateReport: (reportId: string, body: ReportRatingRequest) =>
    invalidateAfter(
      http<RatingResult>(`/api/community/reports/${reportId}/ratings`, {
        method: "POST",
        body: JSON.stringify(body),
        auth: true,
      }),
      PUBLIC_DATA_KEYS.reports,
    ),

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

  announcements: () =>
    http<AnnouncementsResponse>("/api/community/announcements"),

  activities: () => http<ActivitiesResponse>("/api/community/activities"),

  leaderboard: () => http<LeaderboardResponse>("/api/community/leaderboard"),

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

  createAnnouncement: (body: AnnouncementCreate) =>
    invalidateAfter(
      http<Announcement>("/api/admin/announcements", {
        method: "POST",
        body: JSON.stringify(body),
        auth: true,
      }),
      PUBLIC_DATA_KEYS.announcements,
    ),

  adminAnnouncements: () =>
    http<AnnouncementsResponse>("/api/admin/announcements", { auth: true }),

  updateAnnouncement: (announcementId: string, body: AnnouncementUpdate) =>
    invalidateAfter(
      http<Announcement>(`/api/admin/announcements/${announcementId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
        auth: true,
      }),
      PUBLIC_DATA_KEYS.announcements,
    ),

  archiveAnnouncement: (announcementId: string) =>
    invalidateAfter(
      http<Announcement>(`/api/admin/announcements/${announcementId}`, {
        method: "DELETE",
        auth: true,
      }),
      PUBLIC_DATA_KEYS.announcements,
    ),

  uploadAnnouncementImage: (image: File) => {
    const form = new FormData();
    form.set("image", image);
    return http<{ path: string; url: string }>(
      "/api/admin/announcement-images",
      { method: "POST", body: form, auth: true },
    );
  },

  createActivity: (body: ActivityCreate) =>
    http<Activity>("/api/admin/activities", {
      method: "POST",
      body: JSON.stringify(body),
      auth: true,
    }),

  adminSyncRuns: (limit = 50) =>
    http<AdminSyncRunsResponse>(`/api/admin/sync-runs?limit=${limit}`, {
      auth: true,
    }),

  adminDataHealth: () =>
    http<DataHealthResponse>("/api/admin/data-health", { auth: true }),

  adminForecastModels: () =>
    http<ForecastModelStatusesResponse>("/api/admin/forecast-models", {
      auth: true,
    }),

  adminForecastDataQuality: (days = 7) =>
    http<ForecastDataQualityResponse>(
      `/api/admin/forecast-data-quality?days=${days}`,
      { auth: true },
    ),

  adminForecastProviderHealth: () =>
    http<ForecastProviderHealthResponse>(
      "/api/admin/forecast-provider-health",
      {
        auth: true,
      },
    ),

  adminForecastEvaluation: (days = 14) =>
    http<ForecastEvaluationResponse>(
      `/api/admin/forecast-evaluation?days=${days}`,
      { auth: true },
    ),

  adminForecastFalseSafeCases: (days = 30, limit = 100) =>
    http<ForecastFalseSafeCasesResponse>(
      `/api/admin/forecast-false-safe-cases?days=${days}&limit=${limit}`,
      { auth: true },
    ),

  reviewForecastFalseSafeCase: (
    runId: string,
    horizonHours: number,
    variant: string,
    body: ForecastFalseSafeReviewRequest,
  ) =>
    http(
      `/api/admin/forecast-false-safe-cases/${encodeURIComponent(runId)}/${horizonHours}/${encodeURIComponent(variant)}/review`,
      { method: "PUT", body: JSON.stringify(body), auth: true },
    ),

  adminForecastReleaseDecisions: (limit = 100) =>
    http<ForecastReleaseDecisionsResponse>(
      `/api/admin/forecast-release-decisions?limit=${limit}`,
      { auth: true },
    ),

  adminNotificationOutbox: () =>
    http<NotificationOutboxSummary>("/api/admin/notification-outbox", {
      auth: true,
    }),

  adminDataIssues: (limit = 100) =>
    http<DataIssuesResponse>(`/api/admin/data-issues?limit=${limit}`, {
      auth: true,
    }),

  updateAdminDataIssue: (issueId: string, body: DataIssueUpdateRequest) =>
    http<DataIssueRow>(
      `/api/admin/data-issues/${encodeURIComponent(issueId)}`,
      {
        method: "PATCH",
        body: JSON.stringify(body),
        auth: true,
      },
    ),

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
