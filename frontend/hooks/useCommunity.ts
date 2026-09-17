"use client";

import { useCallback, useEffect, useState } from "react";

import { api, apiErrorMessage } from "@/frontend/lib/api-client";
import {
  buildDemoCommunityReports,
  isCommunityDemoMode,
} from "@/frontend/lib/demo-community";
import { getSupabaseBrowserClient } from "@/frontend/lib/supabase";
import type {
  Activity,
  Announcement,
  CommunityMapPoint,
  CommunityReport,
  LeaderboardEntry,
} from "@/frontend/types";

const MAP_FALLBACK_REFRESH_MS = 5 * 60_000;

async function loadCommunityMapData(includeReports: boolean) {
  return Promise.allSettled([
    includeReports
      ? api.communityReports()
      : Promise.resolve({ reports: [] as CommunityReport[], count: 0 }),
    api.communityMapPoints(),
  ]);
}

/** Data required by the map and local-air estimate only. */
export function useCommunityMapData({
  includeReports = true,
}: { includeReports?: boolean } = {}) {
  const [reports, setReports] = useState<CommunityReport[]>([]);
  const [mapPoints, setMapPoints] = useState<CommunityMapPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [demoMode, setDemoMode] = useState(false);

  const applyResults = useCallback(
    (results: Awaited<ReturnType<typeof loadCommunityMapData>>) => {
      const demo = isCommunityDemoMode();
      setDemoMode(demo);
      if (includeReports && (results[0].status === "fulfilled" || demo)) {
        const liveReports =
          results[0].status === "fulfilled" ? results[0].value.reports : [];
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
    const results = await loadCommunityMapData(includeReports);
    applyResults(results);
    setLoading(false);
  }, [applyResults, includeReports]);

  useEffect(() => {
    let cancelled = false;
    const reload = () => {
      if (document.visibilityState === "hidden") return;
      void loadCommunityMapData(includeReports).then((results) => {
        if (!cancelled) {
          applyResults(results);
          setLoading(false);
        }
      });
    };

    reload();
    const timer = window.setInterval(reload, MAP_FALLBACK_REFRESH_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") reload();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    const client = getSupabaseBrowserClient();
    const channel = client
      ?.channel("public-map-invalidation")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "public_map_events" },
        reload,
      )
      .subscribe();

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (client && channel) void client.removeChannel(channel);
    };
  }, [applyResults, includeReports]);

  return { reports, mapPoints, loading, error, demoMode, refresh };
}

/** News feed data; it deliberately does not load map, rewards, or leaderboard. */
export function useAnnouncements() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.announcements();
      setAnnouncements(response.announcements);
    } catch (cause) {
      setError(apiErrorMessage(cause, "โหลดข่าวสารไม่สำเร็จ"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void api
      .announcements()
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
