"use client";

import { useCallback, useEffect, useState } from "react";

import { api, apiErrorMessage } from "@/frontend/lib/api-client";
import {
  buildDemoCommunityReports,
  isCommunityDemoMode,
} from "@/frontend/lib/demo-community";
import {
  cachedPublicValue,
  loadPublicData,
  PUBLIC_DATA_KEYS,
} from "@/frontend/lib/public-data-cache";
import { getSupabaseBrowserClient } from "@/frontend/lib/supabase";
import type {
  Activity,
  Announcement,
  CommunityMapPoint,
  CommunityMapPointsResponse,
  CommunityReport,
  CommunityReportStack,
  CommunityReportsResponse,
  LeaderboardEntry,
  AnnouncementsResponse,
} from "@/frontend/types";

const MAP_FALLBACK_REFRESH_MS = 5 * 60_000;
const REPORT_CACHE_MS = 2 * 60_000;
const ANNOUNCEMENT_CACHE_MS = 10 * 60_000;

async function loadCommunityMapData(includeReports: boolean, force = false) {
  return Promise.allSettled([
    includeReports
      ? loadPublicData(
          PUBLIC_DATA_KEYS.reports,
          REPORT_CACHE_MS,
          api.communityReports,
          force,
        )
      : Promise.resolve({
          reports: [] as CommunityReport[],
          stacks: [],
          count: 0,
        }),
    loadPublicData(
      PUBLIC_DATA_KEYS.mapPoints,
      REPORT_CACHE_MS,
      api.communityMapPoints,
      force,
    ),
  ]);
}

/** Data required by the map and local-air estimate only. */
export function useCommunityMapData({
  includeReports = true,
}: { includeReports?: boolean } = {}) {
  const [reports, setReports] = useState<CommunityReport[]>(() => {
    const cached = cachedPublicValue<CommunityReportsResponse>(
      PUBLIC_DATA_KEYS.reports,
    );
    return includeReports ? (cached?.reports ?? []) : [];
  });
  const [stacks, setStacks] = useState<CommunityReportStack[]>(
    () =>
      (includeReports
        ? cachedPublicValue<CommunityReportsResponse>(PUBLIC_DATA_KEYS.reports)
            ?.stacks
        : null) ?? [],
  );
  const [mapPoints, setMapPoints] = useState<CommunityMapPoint[]>(
    () =>
      cachedPublicValue<CommunityMapPointsResponse>(PUBLIC_DATA_KEYS.mapPoints)
        ?.points ?? [],
  );
  const [loading, setLoading] = useState(
    () =>
      cachedPublicValue(PUBLIC_DATA_KEYS.mapPoints) === null ||
      (includeReports && cachedPublicValue(PUBLIC_DATA_KEYS.reports) === null),
  );
  const [error, setError] = useState<string | null>(null);
  const [demoMode, setDemoMode] = useState(false);

  const applyResults = useCallback(
    (results: Awaited<ReturnType<typeof loadCommunityMapData>>) => {
      const demo = isCommunityDemoMode();
      setDemoMode(demo);
      if (includeReports && (results[0].status === "fulfilled" || demo)) {
        const liveReports =
          results[0].status === "fulfilled" ? results[0].value.reports : [];
        setStacks(
          results[0].status === "fulfilled"
            ? (results[0].value.stacks ?? [])
            : [],
        );
        setReports(
          demo ? [...buildDemoCommunityReports(), ...liveReports] : liveReports,
        );
      }
      if (results[1].status === "fulfilled") {
        setMapPoints(results[1].value.points);
      }
      const failed = results.find((result) => result.status === "rejected");
      setError(
        failed?.status === "rejected"
          ? apiErrorMessage(failed.reason, "โหลดจุดข้อมูลชุมชนบางส่วนไม่สำเร็จ")
          : null,
      );
    },
    [includeReports],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    const results = await loadCommunityMapData(includeReports, true);
    applyResults(results);
    setLoading(false);
  }, [applyResults, includeReports]);

  useEffect(() => {
    let cancelled = false;
    const reload = (force = false) => {
      if (document.visibilityState === "hidden") return;
      void loadCommunityMapData(includeReports, force).then((results) => {
        if (!cancelled) {
          applyResults(results);
          setLoading(false);
        }
      });
    };

    reload();
    const timer = window.setInterval(() => reload(), MAP_FALLBACK_REFRESH_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") reload();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    const client = getSupabaseBrowserClient();
    // RealtimeClient reuses channels by topic. Map and Today can now stay
    // mounted together, so each hook instance needs its own topic.
    const channel = client
      ?.channel(
        `public-map-invalidation-${Math.random().toString(36).slice(2)}`,
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "public_map_events" },
        () => reload(true),
      )
      .subscribe();

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (client && channel) void client.removeChannel(channel);
    };
  }, [applyResults, includeReports]);

  return { reports, stacks, mapPoints, loading, error, demoMode, refresh };
}

/** News feed data; it deliberately does not load map, rewards, or leaderboard. */
export function useAnnouncements() {
  const [announcements, setAnnouncements] = useState<Announcement[]>(
    () =>
      cachedPublicValue<AnnouncementsResponse>(PUBLIC_DATA_KEYS.announcements)
        ?.announcements ?? [],
  );
  const [loading, setLoading] = useState(
    () => cachedPublicValue(PUBLIC_DATA_KEYS.announcements) === null,
  );
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await loadPublicData(
        PUBLIC_DATA_KEYS.announcements,
        ANNOUNCEMENT_CACHE_MS,
        api.announcements,
        true,
      );
      setAnnouncements(response.announcements);
    } catch (cause) {
      setError(apiErrorMessage(cause, "โหลดข่าวสารไม่สำเร็จ"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadPublicData(
      PUBLIC_DATA_KEYS.announcements,
      ANNOUNCEMENT_CACHE_MS,
      api.announcements,
    )
      .then((response) => {
        if (!cancelled) setAnnouncements(response.announcements);
      })
      .catch((cause) => {
        if (!cancelled) {
          setError(apiErrorMessage(cause, "โหลดข่าวสารไม่สำเร็จ"));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { announcements, loading, error, refresh };
}

export function useCommunityRewards() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [leaders, setLeaders] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void Promise.allSettled([api.activities(), api.leaderboard()]).then(
      ([activityResult, leaderResult]) => {
        if (cancelled) return;
        if (activityResult.status === "fulfilled") {
          setActivities(activityResult.value.activities);
        }
        if (leaderResult.status === "fulfilled") {
          setLeaders(leaderResult.value.users);
        }
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  return { activities, leaders, loading };
}
