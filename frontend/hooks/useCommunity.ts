"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { api, apiErrorMessage } from "@/frontend/lib/api-client";
import {
  buildDemoCommunityReports,
  buildDemoStackScenario,
  isCommunityDemoMode,
  isCommunityStackDemoMode,
} from "@/frontend/lib/demo-community";
import {
  cachedPublicValue,
  loadPublicData,
  PUBLIC_DATA_KEYS,
} from "@/frontend/lib/public-data-cache";
import { getSupabaseBrowserClient } from "@/frontend/lib/supabase";
import type {
  Announcement,
  CommunityReport,
  CommunityReportStack,
  CommunityReportsResponse,
  AnnouncementsResponse,
} from "@/frontend/types";

const MAP_FALLBACK_REFRESH_MS = 5 * 60_000;
const REPORT_CACHE_MS = 2 * 60_000;
const ANNOUNCEMENT_CACHE_MS = 60_000;

const loadCommunityMapData = (force = false) =>
  loadPublicData(
    PUBLIC_DATA_KEYS.reports,
    REPORT_CACHE_MS,
    api.communityReports,
    force,
  );

/** Public community reports and stacks for map views. */
export function useCommunityMapData() {
  const [reports, setReports] = useState<CommunityReport[]>(() => {
    const cached = cachedPublicValue<CommunityReportsResponse>(
      PUBLIC_DATA_KEYS.reports,
    );
    return cached?.reports ?? [];
  });
  const [stacks, setStacks] = useState<CommunityReportStack[]>(
    () =>
      cachedPublicValue<CommunityReportsResponse>(PUBLIC_DATA_KEYS.reports)
        ?.stacks ?? [],
  );
  const [loading, setLoading] = useState(
    () => cachedPublicValue(PUBLIC_DATA_KEYS.reports) === null,
  );
  const [error, setError] = useState<string | null>(null);
  const [demoMode, setDemoMode] = useState(false);

  const applyResult = useCallback((result: CommunityReportsResponse) => {
    if (result.reset_version) {
      try {
        const previous = localStorage.getItem("cp-community-reset-version");
        if (previous && previous !== result.reset_version)
          window.dispatchEvent(new Event("cp-community-reset"));
        localStorage.setItem(
          "cp-community-reset-version",
          result.reset_version,
        );
      } catch {
        /* Storage may be disabled. */
      }
    }
    const demo = isCommunityDemoMode();
    const stackDemo = isCommunityStackDemoMode();
    setDemoMode(demo);
    if (stackDemo) {
      const people =
        new URLSearchParams(window.location.search).get("people") === "5"
          ? 5
          : 2;
      const scenario = buildDemoStackScenario(Date.now(), people);
      setReports(scenario.reports);
      setStacks(scenario.stacks);
    } else {
      setStacks(result.stacks ?? []);
      setReports(
        demo
          ? [...buildDemoCommunityReports(), ...result.reports]
          : result.reports,
      );
    }
    setError(null);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      applyResult(await loadCommunityMapData(true));
    } catch (error) {
      if (isCommunityDemoMode()) {
        applyResult({ reports: [], stacks: [], count: 0 });
      }
      setError(apiErrorMessage(error, "โหลดรายงานชุมชนไม่สำเร็จ"));
    } finally {
      setLoading(false);
    }
  }, [applyResult]);

  useEffect(() => {
    let cancelled = false;
    const reload = (force = false) => {
      if (document.visibilityState === "hidden") return;
      void loadCommunityMapData(force)
        .then((result) => {
          if (!cancelled) {
            applyResult(result);
            setLoading(false);
          }
        })
        .catch((error) => {
          if (!cancelled) {
            if (isCommunityDemoMode()) {
              applyResult({ reports: [], stacks: [], count: 0 });
            }
            setError(apiErrorMessage(error, "โหลดรายงานชุมชนไม่สำเร็จ"));
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
  }, [applyResult]);

  return { reports, stacks, loading, error, demoMode, refresh };
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
  const [feed, setFeed] = useState<AnnouncementsResponse | null>(() =>
    cachedPublicValue<AnnouncementsResponse>(PUBLIC_DATA_KEYS.announcements),
  );
  const [loadingMore, setLoadingMore] = useState(false);
  const requestVersion = useRef(0);
  const moreInFlight = useRef(false);

  const refresh = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    setError(null);
    try {
      const response = await loadPublicData(
        PUBLIC_DATA_KEYS.announcements,
        ANNOUNCEMENT_CACHE_MS,
        () => api.announcements(),
        true,
      );
      if (version === requestVersion.current) {
        setAnnouncements(response.announcements);
        setFeed(response);
      }
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
      () => api.announcements(),
    )
      .then((response) => {
        if (!cancelled) {
          setAnnouncements(response.announcements);
          setFeed(response);
        }
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
      requestVersion.current += 1;
    };
  }, []);

  const loadMore = useCallback(async () => {
    if (moreInFlight.current || loading || feed?.next_offset == null) return;
    moreInFlight.current = true;
    const version = requestVersion.current;
    setLoadingMore(true);
    setError(null);
    try {
      const response = await api.announcements(feed.next_offset);
      if (version !== requestVersion.current) return;
      setAnnouncements((current) => [
        ...new Map(
          [...current, ...response.announcements].map((item) => [
            item.id,
            item,
          ]),
        ).values(),
      ]);
      setFeed(response);
    } catch (cause) {
      setError(apiErrorMessage(cause, "โหลดข่าวเพิ่มเติมไม่สำเร็จ"));
    } finally {
      moreInFlight.current = false;
      setLoadingMore(false);
    }
  }, [feed, loading]);

  return {
    announcements,
    loading,
    error,
    refresh,
    loadMore,
    loadingMore,
    hasMore: feed?.has_more ?? false,
    checkedAt: feed?.checked_at ?? null,
    syncStatus: feed?.sync_status ?? "unknown",
  };
}
