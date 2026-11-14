import { beforeEach, describe, expect, it, vi } from "vitest";

import { getAccessToken } from "./supabase";
import { accountDataGeneration } from "./account-data-cache";
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

  it("invalidates private profile data after saving identity with a query string", async () => {
    const before = accountDataGeneration();
    await api.xpSettings({
      alias: "สายลม",
      hidden: false,
      identity_mode: "alias",
    });
    expect(accountDataGeneration()).toBe(before + 1);
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe(
      "/api/community/me/xp?details=false",
    );
  });

  it("encodes a historical endpoint and keeps cancellation on the request", async () => {
    const controller = new AbortController();
    await api.history(
      "station / one",
      24,
      "2026-11-11T12:00:00.000Z",
      controller.signal,
    );
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    const params = new URL(String(url), "http://localhost").searchParams;
    expect(params.get("station_id")).toBe("station / one");
    expect(params.get("end_at")).toBe("2026-11-11T12:00:00.000Z");
    expect(init?.signal).toBe(controller.signal);
  });

  it("rejects oversized combined uploads before contacting the API", async () => {
    const form = new FormData();
    form.set("image", new File([new Uint8Array(2_500_000)], "one.jpg"));
    form.append(
      "burst_images",
      new File([new Uint8Array(2_000_000)], "two.jpg"),
    );
    await expect(api.createReportDraft(form)).rejects.toMatchObject({
      status: 413,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not expose administrator mutation commands", () => {
    for (const method of [
      "reverseXP",
      "createAnnouncement",
      "updateAnnouncement",
      "archiveAnnouncement",
      "uploadAnnouncementImage",
      "createActivity",
      "updateAdminDataIssue",
      "reviewForecastFalseSafeCase",
    ]) {
      expect(api).not.toHaveProperty(method);
    }
  });

  it("keeps private Trust reads authenticated and uncached without score mutation commands", async () => {
    await api.communityTrustMe();
    await api.communityTrustOwnerReviews();
    await api.adminCommunityTrustReviews();
    for (const [url, options] of vi.mocked(fetch).mock.calls) {
      expect(String(url)).toMatch(
        /^\/api\/(community\/trust|admin\/community-trust)\//,
      );
      expect(new Headers(options?.headers).get("Authorization")).toBe(
        "Bearer access-token",
      );
      expect(options?.cache).toBe("no-store");
      expect(options?.method ?? "GET").toBe("GET");
    }
    const scope = {
      from_day: "2026-11-01",
      to_day: "2026-11-07",
      message: "Please review these assessments",
    };
    await api.communityTrustReview(scope);
    const [url, options] = vi.mocked(fetch).mock.calls.at(-1)!;
    expect(url).toBe("/api/community/trust/reviews");
    expect(options?.method).toBe("POST");
    expect(JSON.parse(String(options?.body))).toEqual(scope);
    expect(new Headers(options?.headers).get("Authorization")).toBe(
      "Bearer access-token",
    );
    for (const method of [
      "setCommunityTrustScore",
      "adminCommunityTrustFinding",
      "adminCommunityTrustReview",
    ])
      expect(api).not.toHaveProperty(method);
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

    await api.adminAnnouncements();
    expect(cachedPublicValue(PUBLIC_DATA_KEYS.announcements)).not.toBeNull();

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
      () => api.forecastGridMetadata(),
      () =>
        api.forecastGridFrames(
          "generation",
          "2030-01-01T00:00Z",
          "2030-01-01T05:00Z",
          { min_lat: 5, max_lat: 21, min_lon: 97, max_lon: 106 },
        ),
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
      () => api.captureSession(),
      () => api.createReportDraft(form),
      () =>
        api.photoMetadata(
          new File(["image"], "meter.jpg", { type: "image/jpeg" }),
        ),
      () => api.submitReportDraft("draft-1", {} as never),
      () => api.deleteReportDraft("draft-1"),
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
      () => api.myReports(),
      () => api.xpOverview(),
      () => api.adminReports(),
      () => api.adminAnnouncements(),
      () => api.adminSyncRuns(),
      () => api.adminDataHealth(),
      () => api.adminNotificationOutbox(),
      () => api.adminDataIssues(),
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
      "/api/history?station_id=station+%2F+one&hours=24",
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

it("uses recovery copy for server failures while retaining diagnostics in the error object", () => {
  const error = new ApiError("SUPABASE_URL / SERVICE_ROLE_KEY", 503);
  expect(apiErrorMessage(error, "โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่")).toBe(
    "โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่",
  );
  expect(error.message).toBe("SUPABASE_URL / SERVICE_ROLE_KEY");
  expect(
    apiErrorMessage(new ApiError("กรุณาเข้าสู่ระบบก่อน", 401), "fallback"),
  ).toBe("กรุณาเข้าสู่ระบบก่อน");
});

it("uses readable recovery copy for structured validation errors", () => {
  expect(
    apiErrorMessage(
      new ApiError("[object Object]", 422),
      "กรุณาตรวจสอบข้อมูลแล้วลองใหม่",
    ),
  ).toBe("กรุณาตรวจสอบข้อมูลแล้วลองใหม่");
});
