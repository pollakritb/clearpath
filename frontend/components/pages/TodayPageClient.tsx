"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useCurrentUserId } from "@/frontend/components/auth/AuthProvider";
import LeaderboardEntryCard from "@/frontend/components/community/LeaderboardEntryCard";
import { useCommunityMapData } from "@/frontend/hooks/useCommunity";
import { useOwnedReportIds } from "@/frontend/hooks/useOwnedReportIds";
import { nearestHeatmapPoint } from "@/frontend/lib/nearest-surface";
import NationalSummary from "@/frontend/components/app/NationalSummary";
import UserPageShell from "@/frontend/components/app/UserPageShell";
import AQICard from "@/frontend/components/panels/AQICard";
import ForecastPanel from "@/frontend/components/panels/ForecastPanel";
import { useCurrentLocation } from "@/frontend/hooks/useCurrentLocation";
import { useForecast } from "@/frontend/hooks/useForecast";
import { useHistory } from "@/frontend/hooks/useHistory";
import { usePm25 } from "@/frontend/hooks/usePm25";
import { haversineKm } from "@/frontend/lib/distance";
import RequestTrackingCard from "@/frontend/components/measurement/RequestTrackingCard";

export default function TodayPageClient({
  stationId,
  area,
}: {
  stationId?: string;
  area?: { lat: number; lon: number; name?: string };
}) {
  const router = useRouter();
  const pm25 = usePm25();
  const community = useCommunityMapData();
  const currentUserId = useCurrentUserId();
  const history = useHistory();
  const forecast = useForecast();
  const currentLocation = useCurrentLocation(true);
  const [showHistory, setShowHistory] = useState(false);

  const serviceAreaStations = useMemo(
    () => pm25.stations.filter((station) => station.in_service_area),
    [pm25.stations],
  );
  const routeStation = useMemo(
    () =>
      stationId
        ? (serviceAreaStations.find((station) => station.id === stationId) ??
          null)
        : null,
    [serviceAreaStations, stationId],
  );
  const ownedReports = useOwnedReportIds(currentUserId, community.reports);
  const nearestPoint = useMemo(
    () =>
      nearestHeatmapPoint(
        currentLocation.location,
        pm25.stations,
        ownedReports.ready
          ? community.reports.filter(
              (report) => !ownedReports.ids.has(report.id),
            )
          : [],
        currentUserId,
      ),
    [
      currentLocation.location,
      pm25.stations,
      community.reports,
      currentUserId,
      ownedReports.ids,
      ownedReports.ready,
    ],
  );
  const automaticStation =
    nearestPoint?.source === "station"
      ? (pm25.stations.find((station) => station.id === nearestPoint.id) ??
        null)
      : null;
  const selectedReport =
    !stationId && nearestPoint?.source === "community"
      ? (community.reports.find((report) => report.id === nearestPoint.id) ??
        null)
      : null;
  const selectedStation = routeStation ?? automaticStation;
  const nearestDistanceKm =
    currentLocation.location && nearestPoint
      ? haversineKm(
          currentLocation.location.lat,
          currentLocation.location.lon,
          nearestPoint.lat,
          nearestPoint.lon,
        )
      : null;
  const forecastTarget = useMemo(() => {
    if (stationId) return routeStation?.id ?? null;
    if (area) return { lat: area.lat, lon: area.lon };
    if (selectedReport)
      return { lat: selectedReport.lat, lon: selectedReport.lon };
    return selectedStation?.id ?? null;
  }, [area, routeStation?.id, selectedReport, selectedStation?.id, stationId]);

  const forecastForCurrentTarget =
    forecast.data && forecastTarget
      ? typeof forecastTarget === "string"
        ? forecast.data.station_id === forecastTarget
          ? forecast.data
          : null
        : forecast.data.target_kind === "area" &&
            forecast.data.requested_lat ===
              Number(forecastTarget.lat.toFixed(2)) &&
            forecast.data.requested_lon ===
              Number(forecastTarget.lon.toFixed(2))
          ? forecast.data
          : null
      : null;

  const forecastLoad = forecast.load;
  useEffect(() => {
    if (!forecastTarget) return;
    void forecastLoad(forecastTarget, 120);
  }, [forecastLoad, forecastTarget]);

  const toggleHistory = useCallback(() => {
    setShowHistory((previous) => {
      const next = !previous;
      if (next && selectedStation) void history.load(selectedStation.id, 24);
      return next;
    });
  }, [history, selectedStation]);

  const refresh = useCallback(() => {
    currentLocation.request();
    const tasks: Promise<unknown>[] = [pm25.refresh(), community.refresh()];
    if (forecastTarget) tasks.push(forecast.load(forecastTarget, 120, true));
    if (selectedStation) {
      if (showHistory) tasks.push(history.load(selectedStation.id, 24));
    }
    void Promise.allSettled(tasks);
  }, [
    currentLocation,
    community,
    forecast,
    forecastTarget,
    history,
    pm25,
    selectedStation,
    showHistory,
  ]);

  return (
    <UserPageShell
      tab="overview"
      icon="activity"
      header={{
        stationCount: serviceAreaStations.length,
        updatedAt: pm25.updatedAt,
        loading: pm25.loading,
        delayedCount: pm25.counts.delayed,
        expiredCount: pm25.counts.expired,
        error: pm25.error,
        onRefresh: refresh,
      }}
    >
      <div className="cp-overview-stack">
        <RequestTrackingCard userId={currentUserId} />
        <div className="cp-desktop-summary">
          <NationalSummary stations={serviceAreaStations} />
        </div>
        <section
          className="cp-air-outlook"
          aria-label="ค่าฝุ่นใกล้ที่สุดและพยากรณ์"
        >
          <AQICard
            station={selectedStation}
            report={selectedReport}
            distanceKm={stationId ? null : nearestDistanceKm}
            showHistory={showHistory && !selectedReport}
            onToggleHistory={toggleHistory}
            historyPoints={
              history.stationId === selectedStation?.id ? history.points : []
            }
            historyLoading={history.loading}
            onOpenMap={() => router.push("/")}
          />
          <ForecastPanel
            compact
            station={selectedReport || area ? null : selectedStation}
            areaLabel={
              stationId
                ? undefined
                : area
                  ? (area.name ?? "บริเวณที่เลือก")
                  : selectedReport
                    ? "บริเวณรายงานที่ใกล้คุณที่สุด"
                    : undefined
            }
            data={forecastForCurrentTarget}
            loading={forecast.loading}
            error={forecast.error}
          />
        </section>
        <LeaderboardEntryCard userId={currentUserId} />
      </div>
    </UserPageShell>
  );
}
