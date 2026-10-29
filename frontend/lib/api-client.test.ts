import { beforeEach, describe, expect, it, vi } from "vitest";

import { getAccessToken } from "./supabase";
import {
  cachedPublicValue,
  clearPublicDataCache,
  loadPublicData,
  PUBLIC_DATA_KEYS,
} from "./public-data-cache";

vi.mock("./supabase", () => ({
  getAccessToken: vi.fn(),
}));

import { api, ApiError, apiErrorMessage } from "./api-client";

const mockedGetAccessToken = vi.mocked(getAccessToken);

function jsonResponse(body: unknown = { ok: true }, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("api client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearPublicDataCache();
    vi.stubGlobal("navigator", { userAgent: "ClearPath unit test" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse()),
    );
    mockedGetAccessToken.mockResolvedValue("access-token");
  });

  it("invalidates affected public data only after successful writes", async () => {
    await loadPublicData(PUBLIC_DATA_KEYS.reports, 60_000, async () => ({
      count: 1,
    }));
    await loadPublicData(PUBLIC_DATA_KEYS.mapPoints, 60_000, async () => ({
      count: 1,
    }));
    await loadPublicData(PUBLIC_DATA_KEYS.announcements, 60_000, async () => ({
      count: 1,
    }));

    await api.submitReportDraft("draft-1", {} as never);
    expect(cachedPublicValue(PUBLIC_DATA_KEYS.reports)).toBeNull();
    expect(cachedPublicValue(PUBLIC_DATA_KEYS.mapPoints)).toBeNull();
    expect(cachedPublicValue(PUBLIC_DATA_KEYS.announcements)).not.toBeNull();

    await api.createAnnouncement({} as never);
    expect(cachedPublicValue(PUBLIC_DATA_KEYS.announcements)).toBeNull();

    await loadPublicData(PUBLIC_DATA_KEYS.reports, 60_000, async () => ({
      count: 2,
    }));
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ detail: "failed" }, 500),
    );
    await expect(
      api.setReportReaction("report-1", {} as never),
    ).rejects.toThrow();
    expect(cachedPublicValue(PUBLIC_DATA_KEYS.reports)).toEqual({ count: 2 });
  });

  it("keeps every frontend request on the same-origin API boundary", async () => {
    const form = new FormData();
    form.set("image", new Blob(["image"], { type: "image/jpeg" }), "meter.jpg");

    const calls: Array<() => Promise<unknown>> = [
      () => api.pm25Current(),
      () => api.reverseLocation(13.8, 100.1),
      () => api.measurementRequests(),
      () => api.measurementRequest("request / one"),
      () => api.createMeasurementRequest({} as never),
      () => api.cancelMeasurementRequest("request / one"),
      () => api.declineMeasurementRequest("request / one"),
      () => api.measurementHelper(),
      () => api.setMeasurementHelper(true),
      () => api.measurementPresence({} as never),
      () => api.weather(13.8, 100.1),
      () => api.firms(),
      () => api.history("station / one"),
      () => api.mapHistory("2026-09-19T03:00:00.000Z"),
      () => api.forecast("station / one"),
      () => api.forecast({ lat: 13.8, lon: 100.1 }),
      () => api.communityReports(),
      () => api.communityMapPoints(),
      () => api.reportDataIssue({} as never),
      () => api.captureSession(),
      () => api.reviewQueue(13.8, 100.1),
      () => api.createReportDraft(form),
      () =>
        api.photoMetadata(
          new File(["image"], "meter.jpg", { type: "image/jpeg" }),
        ),
      () => api.submitReportDraft("draft-1", {} as never),
      () => api.deleteReportDraft("draft-1"),
      () => api.rateReport("report-1", {} as never),
      () => api.reportEngagement("report-1"),
      () => api.myReportEngagement("report-1"),
      () => api.clearReportReaction("report-1"),
      () => api.addReportComment("report-1", {} as never),
      () => api.removeReportComment("report-1", "comment-1"),
      () => api.announcements(),
      () => api.activities(),
      () => api.leaderboard(),
      () => api.notificationPreferences(),
      () => api.updateNotificationPreferences({} as never),
      () => api.testNotification(),
      () => api.lineNotificationStatus(),
      () => api.createLineLinkCode(),
      () => api.disconnectLine(),
      () => api.testLineNotification(),
      () => api.notifications(),
      () => api.markNotificationRead("notification-1"),
      () => api.markAllNotificationsRead(),
      () => api.searchLocations("Nakhon Pathom / center"),
      () => api.myProfile(),
      () => api.adminReports(),
      () => api.createAnnouncement({} as never),
      () => api.adminAnnouncements(),
      () => api.updateAnnouncement("announcement-1", {} as never),
      () => api.archiveAnnouncement("announcement-1"),
      () => api.uploadAnnouncementImage(new Blob(["image"]) as File),
      () => api.createActivity({} as never),
      () => api.adminSyncRuns(),
      () => api.adminDataHealth(),
      () => api.adminForecastModels(),
      () => api.adminForecastDataQuality(),
      () => api.adminForecastProviderHealth(),
      () => api.adminForecastEvaluation(),
      () => api.adminForecastFalseSafeCases(),
      () =>
        api.reviewForecastFalseSafeCase(
          "run / one",
          12,
          "candidate / v1",
          {} as never,
        ),
      () => api.adminForecastReleaseDecisions(),
      () => api.adminNotificationOutbox(),
      () => api.adminDataIssues(),
      () => api.updateAdminDataIssue("issue / one", {} as never),
      () => api.adminAuditLogs(),
    ];

    for (const call of calls) {
      await expect(call()).resolves.toEqual({ ok: true });
    }

    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledTimes(calls.length);
    for (const [url] of fetchMock.mock.calls) {
      expect(String(url)).toMatch(/^\/api\//);
    }

    expect(fetchMock.mock.calls.map(([url]) => String(url))).toContain(
      "/api/history?station_id=station%20%2F%20one&hours=24",
    );
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toContain(
      "/api/history/map?at=2026-09-19T03%3A00%3A00.000Z&max_age_minutes=90",
    );
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toContain(
      "/api/locations/search?q=Nakhon%20Pathom%20%2F%20center",
    );
    const authenticated = fetchMock.mock.calls.find(
      ([url]) => url === "/api/community/capture-session",
    );
    expect(new Headers(authenticated?.[1]?.headers).get("Authorization")).toBe(
      "Bearer access-token",
    );
    for (const [url, options] of fetchMock.mock.calls) {
      if (String(url).startsWith("/api/measurement-requests"))
        expect(new Headers(options?.headers).get("Authorization")).toBe(
          "Bearer access-token",
        );
    }

    const multipart = fetchMock.mock.calls.find(
      ([url]) => url === "/api/community/report-drafts",
    );
    expect(new Headers(multipart?.[1]?.headers).has("Content-Type")).toBe(
      false,
    );
  });

  it("maps JSON and non-JSON failures to safe ApiError values", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ detail: "Access denied" }, 403))
      .mockResolvedValueOnce(
        new Response("upstream unavailable", {
          status: 502,
          statusText: "Bad Gateway",
        }),
      );

    await expect(api.pm25Current()).rejects.toMatchObject({
      name: "ApiError",
      message: "Access denied",
      status: 403,
    });
    await expect(api.pm25Current()).rejects.toMatchObject({
      name: "ApiError",
      message: "Bad Gateway",
      status: 502,
    });
  });

  it("shows API details only for normalized API errors", () => {
    expect(
      apiErrorMessage(new ApiError("Useful detail", 400), "fallback"),
    ).toBe("Useful detail");
    expect(apiErrorMessage(new Error("internal"), "fallback")).toBe("fallback");
  });

  it("exports audit logs with the current token and preserves access-denied failures", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response("audit rows"));
    expect(await (await api.downloadAdminAuditLogs()).text()).toBe(
      "audit rows",
    );
    expect(
      new Headers(vi.mocked(fetch).mock.calls[0][1]?.headers).get(
        "Authorization",
      ),
    ).toBe("Bearer access-token");
    mockedGetAccessToken.mockResolvedValueOnce(null);
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response("denied", { status: 403 }),
    );
    await expect(api.downloadAdminAuditLogs()).rejects.toMatchObject({
      status: 403,
    });
    expect(
      new Headers(vi.mocked(fetch).mock.calls[1][1]?.headers).has(
        "Authorization",
      ),
    ).toBe(false);
  });

  it("keeps HTTP status text when an error response has no detail", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({}), {
        status: 503,
        statusText: "Unavailable",
      }),
    );
    await expect(api.pm25Current()).rejects.toMatchObject({
      message: "Unavailable",
      status: 503,
    });
  });
});
