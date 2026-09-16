"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import MobileAirSummary from "@/frontend/components/app/MobileAirSummary";
import NationalSummary from "@/frontend/components/app/NationalSummary";
import UserPageShell from "@/frontend/components/app/UserPageShell";
import AQICard from "@/frontend/components/panels/AQICard";
import FireAlertPanel from "@/frontend/components/panels/FireAlertPanel";
import ForecastPanel from "@/frontend/components/panels/ForecastPanel";
import { useCommunityMapData } from "@/frontend/hooks/useCommunity";
import { useCurrentLocation } from "@/frontend/hooks/useCurrentLocation";
import { FIRMS_REFRESH_MS, useFirms } from "@/frontend/hooks/useFirms";
import { useForecast } from "@/frontend/hooks/useForecast";
import { useHistory } from "@/frontend/hooks/useHistory";
import { usePm25 } from "@/frontend/hooks/usePm25";
import { useWeather } from "@/frontend/hooks/useWeather";
import { haversineKm } from "@/frontend/lib/idw";
import type { Station } from "@/frontend/types";

const MAX_AUTOMATIC_REFERENCE_DISTANCE_KM = 30;

function nearestReferenceStation(
  stations: Station[],
  location: { lat: number; lon: number } | null,
) {
  if (!location) return null;
  const nearest = stations
    .filter(
      (station) =>
        station.in_service_area &&
        station.eligible_for_surface &&
        station.pm25 != null,
    )
    .map((station) => ({
      station,
      distanceKm: haversineKm(
        location.lat,
        location.lon,
        station.lat,
        station.lon,
      ),
    }))
    .filter(
      ({ distanceKm }) => distanceKm <= MAX_AUTOMATIC_REFERENCE_DISTANCE_KM,
    )
    .sort((left, right) => left.distanceKm - right.distanceKm)[0];
  return nearest?.station ?? null;
}

export default function TodayPageClient({ stationId }: { stationId?: string }) {
  const router = useRouter();
  const pm25 = usePm25();
  const weather = useWeather();
  const history = useHistory();
  const firms = useFirms();
  const forecast = useForecast();
  const community = useCommunityMapData({ includeReports: false });
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
  const automaticStation = useMemo(
    () =>
      nearestReferenceStation(serviceAreaStations, currentLocation.location),
    [currentLocation.location, serviceAreaStations],
  );
  const selectedStation = routeStation ?? automaticStation;

  const loadFires = firms.load;
  useEffect(() => {
    void loadFires(1);
    const timer = window.setInterval(() => void loadFires(1), FIRMS_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [loadFires]);

  const weatherLoad = weather.load;
  const forecastLoad = forecast.load;
  useEffect(() => {
    if (!selectedStation) return;
    void Promise.allSettled([
      weatherLoad(selectedStation.lat, selectedStation.lon),
      forecastLoad(selectedStation.id, 24),
    ]);
  }, [forecastLoad, selectedStation, weatherLoad]);

  const toggleHistory = useCallback(() => {
    setShowHistory((previous) => {
      const next = !previous;
      if (next && selectedStation) void history.load(selectedStation.id, 24);
      return next;
    });
  }, [history, selectedStation]);

  const refresh = useCallback(() => {
    currentLocation.request();
    const tasks: Promise<unknown>[] = [
      pm25.refresh(),
      community.refresh(),
      firms.load(1),
    ];
    if (selectedStation) {
      tasks.push(
        weather.load(selectedStation.lat, selectedStation.lon),
        forecast.load(selectedStation.id, 24),
      );
      if (showHistory) tasks.push(history.load(selectedStation.id, 24));
    }
    void Promise.allSettled(tasks);
  }, [
    community,
    currentLocation,
    firms,
    forecast,
    history,
    pm25,
    selectedStation,
    showHistory,
    weather,
  ]);

  return (
    <UserPageShell
      tab="overview"
      icon="activity"
      header={{
        stationCount: serviceAreaStations.length,
        updatedAt: pm25.updatedAt,
        loading: pm25.loading || community.loading,
        delayedCount: pm25.counts.delayed,
        expiredCount: pm25.counts.expired,
        error: pm25.error,
        onRefresh: refresh,
      }}
    >
      <div className="cp-overview-stack">
        <MobileAirSummary
          stations={serviceAreaStations}
          communityPoints={community.mapPoints}
          updatedAt={pm25.updatedAt}
          loading={pm25.loading || community.loading}
          location={currentLocation.location}
          locationStatus={currentLocation.status}
          onRequestLocation={currentLocation.request}
          onOpenMap={() => router.push("/")}
          onOpenReport={() => router.push("/report")}
        />
        <div className="cp-desktop-summary">
          <NationalSummary stations={serviceAreaStations} />
        </div>
        <AQICard
          station={selectedStation}
          weather={weather.data}
          weatherLoading={weather.loading}
          showHistory={showHistory}
          onToggleHistory={toggleHistory}
          historyPoints={history.points}
          historyLoading={history.loading}
          onOpenMap={() => router.push("/")}
        />
        <FireAlertPanel
          fires={firms.fires}
          loading={firms.loading}
          status={firms.status}
          message={firms.message}
          checkedAt={firms.checkedAt}
          error={firms.error}
          onShowLayer={() => router.push("/?layer=fires")}
        />
        <ForecastPanel
          station={selectedStation}
          data={forecast.data}
          loading={forecast.loading}
          error={forecast.error}
        />
        {community.error && (
          <p role="alert" className="cp-inline-error">
            {community.error}
          </p>
        )}
      </div>
    </UserPageShell>
  );
}
