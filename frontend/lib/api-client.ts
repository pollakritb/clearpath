// typed fetch wrappers — frontend รู้จักแค่ /api/* (same-origin)

import type {
  ActivitiesResponse,
  Activity,
  ActivityCreate,
  Announcement,
  AnnouncementCreate,
  AnnouncementUpdate,
  AnnouncementsResponse,
  CaptureSessionResponse,
  CommunityReport,
  CommunityProfileResponse,
  CommunityMapPointsResponse,
  CommunityReportsResponse,
  FirmsResponse,
  ForecastResponse,
  HistoryResponse,
  NotificationPreferences,
  NotificationsResponse,
  OperationResponse,
  PushConfigResponse,
  LeaderboardResponse,
  ReportCreateResponse,
  ReportDraftResponse,
  ReportDraftSubmit,
  ReportRatingRequest,
  RatingResult,
  ModerationRequest,
  LocationSearchResponse,
  StationsResponse,
  ValidationResponse,
  Weather,
} from "@/frontend/types";
import type {
  AdminSyncRunsResponse,
  ForecastModelStatusesResponse,
  NotificationOutboxSummary,
} from "@/frontend/types/ui";
import { getAccessToken } from "@/frontend/lib/supabase";

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
  const token = init?.auth ? await getAccessToken() : null;
  const headers = new Headers(init?.headers);
  if (!isForm && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(url, {
    ...init,
    headers,
  });
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

export const api = {
  pm25Current: () => http<StationsResponse>("/api/pm25/current"),

  weather: (lat: number, lon: number) =>
    http<Weather>(`/api/weather?lat=${lat}&lon=${lon}`),

  firms: (days = 1) => http<FirmsResponse>(`/api/firms?days=${days}`),

  history: (stationId: string, hours = 24) =>
    http<HistoryResponse>(
      `/api/history?station_id=${encodeURIComponent(stationId)}&hours=${hours}`,
    ),

  validate: (method: "idw" | "kriging" | "both" = "both") =>
    http<ValidationResponse>(`/api/validate?method=${method}`),

  forecast: (stationId: string, hours = 12) =>
    http<ForecastResponse>(
      `/api/forecast?station_id=${encodeURIComponent(stationId)}&hours=${hours}`,
    ),

  communityReports: () =>
    http<CommunityReportsResponse>("/api/community/reports"),

  communityMapPoints: () =>
    http<CommunityMapPointsResponse>("/api/community/map-points"),

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

  createReportDraft: (form: FormData) =>
    http<ReportDraftResponse>("/api/community/report-drafts", {
      method: "POST",
      body: form,
      auth: true,
    }),

  submitReportDraft: (draftId: string, body: ReportDraftSubmit) =>
    http<ReportCreateResponse>(
      `/api/community/report-drafts/${draftId}/submit`,
      {
        method: "POST",
        body: JSON.stringify(body),
        auth: true,
      },
    ),

  deleteReportDraft: (draftId: string) =>
    http<OperationResponse>(`/api/community/report-drafts/${draftId}`, {
      method: "DELETE",
      auth: true,
    }),

  rateReport: (reportId: string, body: ReportRatingRequest) =>
    http<RatingResult>(`/api/community/reports/${reportId}/ratings`, {
      method: "POST",
      body: JSON.stringify(body),
      auth: true,
    }),

  announcements: () =>
    http<AnnouncementsResponse>("/api/community/announcements"),

  activities: () => http<ActivitiesResponse>("/api/community/activities"),

  leaderboard: () => http<LeaderboardResponse>("/api/community/leaderboard"),

  pushConfig: () => http<PushConfigResponse>("/api/notifications/config"),

  subscribePush: (subscription: PushSubscriptionJSON) =>
    http<OperationResponse>("/api/notifications/subscriptions", {
      method: "POST",
      auth: true,
      body: JSON.stringify({
        endpoint: subscription.endpoint,
        keys: subscription.keys,
        user_agent: navigator.userAgent,
      }),
    }),

  unsubscribePush: (endpoint: string) =>
    http<OperationResponse>("/api/notifications/subscriptions", {
      method: "DELETE",
      auth: true,
      body: JSON.stringify({ endpoint }),
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

  moderateReport: (reportId: string, body: ModerationRequest) =>
    http<CommunityReport>(`/api/admin/reports/${reportId}/moderate`, {
      method: "POST",
      body: JSON.stringify(body),
      auth: true,
    }),

  createAnnouncement: (body: AnnouncementCreate) =>
    http<Announcement>("/api/admin/announcements", {
      method: "POST",
      body: JSON.stringify(body),
      auth: true,
    }),

  adminAnnouncements: () =>
    http<AnnouncementsResponse>("/api/admin/announcements", { auth: true }),

  updateAnnouncement: (announcementId: string, body: AnnouncementUpdate) =>
    http<Announcement>(`/api/admin/announcements/${announcementId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
      auth: true,
    }),

  archiveAnnouncement: (announcementId: string) =>
    http<Announcement>(`/api/admin/announcements/${announcementId}`, {
      method: "DELETE",
      auth: true,
    }),

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

  adminForecastModels: () =>
    http<ForecastModelStatusesResponse>("/api/admin/forecast-models", {
      auth: true,
    }),

  adminNotificationOutbox: () =>
    http<NotificationOutboxSummary>("/api/admin/notification-outbox", {
      auth: true,
    }),
};
