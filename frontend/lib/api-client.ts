import { clearAccountData } from "@/frontend/lib/account-data-cache";
import type {
  AccountPrivacyStatus,
  DeletionRequest,
  PrivacyRequest,
} from "@/frontend/types/account-privacy";
import type {
  CommunityTrustReview,
  CommunityTrustReviewResult,
  CommunityTrustReviews,
} from "@/frontend/types/community-trust";
import type {
  HelpClaim,
  OwnedReportIDs,
  PublicMember,
  XPAdminOverview,
  XPLeaderboard,
  XPResult,
  XPSettings,
  XPSummary,
} from "@/frontend/types/xp";
import { uploadSizeError } from "./upload-limits";
// typed fetch wrappers — frontend รู้จักแค่ /api/* (same-origin)

import { authenticatedFetch } from "@/frontend/lib/auth-request";
import {
  invalidatePublicData,
  PUBLIC_DATA_KEYS,
} from "@/frontend/lib/public-data-cache";
import { getAccessToken } from "@/frontend/lib/supabase";
import type {
  AlertLocationInput,
  AlertLocationStatus,
  AnnouncementsResponse,
  CaptureSessionResponse,
  CommunityReport,
  CommunityReportsResponse,
  FirmsResponse,
  ForecastGridFrames,
  ForecastGridMetadata,
  ForecastResponse,
  HistoryResponse,
  LineLinkCodeResponse,
  LineNotificationStatus,
  LocationLabelResponse,
  LocationSearchResponse,
  MapHistoryResponse,
  MeasurementHelperLocation,
  MeasurementHelperLocationWrite,
  MeasurementHelperSettings,
  MeasurementPresenceUpdate,
  MeasurementRequestCreate,
  MeasurementRequestsResponse,
  MeasurementRequestView,
  NotificationPreferences,
  NotificationsResponse,
  OperationResponse,
  PhotoMetadata,
  PlaceReportSelection,
  ReportComment,
  ReportCommentCreate,
  ReportCreateResponse,
  ReportDraftResponse,
  ReportDraftSubmit,
  ReportEngagementResponse,
  ReportReactionRequest,
  StationsResponse,
} from "@/frontend/types";
import type {
  AdminSyncRunsResponse,
  AuditLogsResponse,
  DataHealthResponse,
  DataIssuesResponse,
  NotificationOutboxSummary,
} from "@/frontend/types/ui";

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
  if (init?.body instanceof FormData) {
    const error = uploadSizeError(init.body);
    if (error) throw new ApiError(error, 413);
  }
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
    (url.endsWith("/submit") || url.split("?")[0] === "/api/community/me/xp")
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

  firms: (days = 1) => http<FirmsResponse>(`/api/firms?days=${days}`),

  history: (
    stationId: string,
    hours = 24,
    endAt?: string,
    signal?: AbortSignal,
  ) => {
    const params = new URLSearchParams({
      station_id: stationId,
      hours: String(hours),
    });
    if (endAt) params.set("end_at", endAt);
    return http<HistoryResponse>(`/api/history?${params}`, { signal });
  },

  mapHistory: (at: string, maxAgeMinutes = 90) => {
    const params = new URLSearchParams({
      at,
      max_age_minutes: String(maxAgeMinutes),
    });
    return http<MapHistoryResponse>(`/api/history/map?${params}`, {
      cache: "no-store",
    });
  },

  forecast: (
    target: string | { lat: number; lon: number },
    hours = 120,
    generationId?: string,
  ) => {
    const params = new URLSearchParams({ hours: String(hours) });
    if (generationId) params.set("generation_id", generationId);
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

  placeReportSelection: (lat: number, lon: number, at: string) => {
    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lon),
      at,
    });
    return http<PlaceReportSelection>(
      `/api/community/place-report-selection?${params}`,
      { cache: "no-store" },
    );
  },

  myReportDetail: (id: string) =>
    http<CommunityReport>(
      `/api/community/me/reports/${encodeURIComponent(id)}`,
      {
        cache: "no-store",
        auth: true,
      },
    ),

  reportDetail: (id: string, requestId?: string | null) =>
    http<CommunityReport>(
      `/api/community/reports/${encodeURIComponent(id)}${requestId ? `?request_id=${encodeURIComponent(requestId)}` : ""}`,
      {
        cache: "no-store",
        auth: true,
      },
    ),

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

  communityTrustOwnerReviews: () =>
    http<CommunityTrustReviews>("/api/community/trust/reviews", {
      auth: true,
      cache: "no-store",
    }),
  adminCommunityTrustReviews: () =>
    http<CommunityTrustReviews>("/api/admin/community-trust/reviews", {
      auth: true,
      cache: "no-store",
    }),
  communityTrustReview: (body: CommunityTrustReview) =>
    http<CommunityTrustReviewResult>("/api/community/trust/reviews", {
      method: "POST",
      body: JSON.stringify(body),
      auth: true,
    }),

  clearReportReaction: (reportId: string, requestKey?: string) =>
    invalidateAfter(
      http<ReportEngagementResponse>(
        `/api/community/reports/${reportId}/reaction${requestKey ? `?request_key=${encodeURIComponent(requestKey)}` : ""}`,
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
  accountPrivacy: () =>
    http<AccountPrivacyStatus>("/api/community/me/privacy", {
      auth: true,
      cache: "no-store",
    }),
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
  xpOverview: () =>
    http<XPSummary | null>("/api/community/me/xp?details=false", {
      auth: true,
      cache: "no-store",
    }),
  xpSettings: (body: XPSettings) =>
    http<XPSummary>("/api/community/me/xp?details=false", {
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

  alertLocation: () =>
    http<AlertLocationStatus>("/api/notifications/location", {
      auth: true,
      cache: "no-store",
    }),
  updateAlertLocation: (
    body: AlertLocationInput,
    options?: { keepalive?: boolean },
  ) =>
    http<AlertLocationStatus>("/api/notifications/location", {
      auth: true,
      keepalive: options?.keepalive,
      method: "PUT",
      body: JSON.stringify(body),
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

  myReports: () =>
    http<CommunityReportsResponse>("/api/community/me/reports", {
      auth: true,
      cache: "no-store",
    }),

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

  adminAuditLogs: (limit = 100, offset = 0, cursor?: string | null) => {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    });
    if (cursor) params.set("cursor", cursor);
    return http<AuditLogsResponse>(`/api/admin/audit-logs?${params}`, {
      auth: true,
    });
  },

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
