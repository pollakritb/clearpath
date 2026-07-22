"use client";

import { useCallback, useEffect, useState } from "react";

import { api, apiErrorMessage } from "@/frontend/lib/api-client";
import { getSupabaseBrowserClient } from "@/frontend/lib/supabase";
import type {
  Activity,
  Announcement,
  CommunityMapPoint,
  CommunityReport,
  UserReputation,
} from "@/frontend/types";

type CommunityResults = Awaited<ReturnType<typeof loadCommunityData>>;

function loadCommunityData() {
  return Promise.allSettled([
    api.communityReports(),
    api.announcements(),
    api.activities(),
    api.leaderboard(),
    api.communityMapPoints(),
  ]);
}

export function useCommunity() {
  const [reports, setReports] = useState<CommunityReport[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [leaders, setLeaders] = useState<UserReputation[]>([]);
  const [mapPoints, setMapPoints] = useState<CommunityMapPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const applyResults = useCallback((results: CommunityResults) => {
    if (results[0].status === "fulfilled") setReports(results[0].value.reports);
    if (results[1].status === "fulfilled") {
      setAnnouncements(results[1].value.announcements);
    }
    if (results[2].status === "fulfilled")
      setActivities(results[2].value.activities);
    if (results[3].status === "fulfilled") setLeaders(results[3].value.users);
    if (results[4].status === "fulfilled")
      setMapPoints(results[4].value.points);
    const failed = results.find((result) => result.status === "rejected");
    setError(
      failed?.status === "rejected"
        ? apiErrorMessage(failed.reason, "โหลดข้อมูลชุมชนบางส่วนไม่สำเร็จ")
        : null,
    );
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const results = await loadCommunityData();
    applyResults(results);
    setLoading(false);
  }, [applyResults]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const results = await loadCommunityData();
      if (cancelled) return;
      applyResults(results);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [applyResults]);

  useEffect(() => {
    let cancelled = false;
    const reload = () => {
      void loadCommunityData().then((results) => {
        if (!cancelled) applyResults(results);
      });
    };
    const timer = window.setInterval(reload, 60_000);
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
      if (client && channel) void client.removeChannel(channel);
    };
  }, [applyResults]);

  return {
    reports,
    announcements,
    activities,
    leaders,
    mapPoints,
    loading,
    error,
    refresh,
  };
}
