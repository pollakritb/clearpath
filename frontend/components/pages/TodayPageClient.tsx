"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import NationalSummary from "@/frontend/components/app/NationalSummary";
import UserPageShell from "@/frontend/components/app/UserPageShell";
import AQICard from "@/frontend/components/panels/AQICard";
import ForecastPanel from "@/frontend/components/panels/ForecastPanel";
import { useCurrentLocation } from "@/frontend/hooks/useCurrentLocation";
import { useForecast } from "@/frontend/hooks/useForecast";
import { useHistory } from "@/frontend/hooks/useHistory";
import { usePm25 } from "@/frontend/hooks/usePm25";
import { useWeather } from "@/frontend/hooks/useWeather";
import { haversineKm } from "@/frontend/lib/distance";
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

export default function TodayPageClient({
  stationId,
  area,
}: {
  stationId?: string;
  area?: { lat: number; lon: number; name?: string };
}) {
  const router = useRouter();
  const pm25 = usePm25();
  const weather = useWeather();
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
  const automaticStation = useMemo(
    () =>
      nearestReferenceStation(serviceAreaStations, currentLocation.location),
    [currentLocation.location, serviceAreaStations],
  );
  const selectedStation = routeStation ?? automaticStation;
  const forecastTarget = useMemo(() => {
    if (stationId) return routeStation?.id ?? null;
    if (area) return { lat: area.lat, lon: area.lon };
    if (currentLocation.location) {
      return {
        lat: currentLocation.location.lat,
        lon: currentLocation.location.lon,
      };
    }
    return null;
  }, [area, currentLocation.location, routeStation?.id, stationId]);
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

  const weatherLoad = weather.load;
  const forecastLoad = forecast.load;
  useEffect(() => {
    if (!forecastTarget) return;
    void forecastLoad(forecastTarget, 120);
  }, [forecastLoad, forecastTarget]);
  useEffect(() => {
    const position = area ?? currentLocation.location ?? selectedStation;
    if (!position) return;
    void weatherLoad(position.lat, position.lon);
  }, [area, currentLocation.location, selectedStation, weatherLoad]);

  const toggleHistory = useCallback(() => {
    setShowHistory((previous) => {
      const next = !previous;
      if (next && selectedStation) void history.load(selectedStation.id, 24);
      return next;
    });
  }, [history, selectedStation]);

  const refresh = useCallback(() => {
    currentLocation.request();
    const tasks: Promise<unknown>[] = [pm25.refresh()];
    if (forecastTarget) tasks.push(forecast.load(forecastTarget, 120, true));
    const weatherPosition = area ?? currentLocation.location ?? selectedStation;
    if (weatherPosition) {
      tasks.push(weather.load(weatherPosition.lat, weatherPosition.lon, true));
    }
    if (selectedStation) {
      if (showHistory) tasks.push(history.load(selectedStation.id, 24));
    }
    void Promise.allSettled(tasks);
  }, [
    currentLocation,
    area,
    forecast,
    forecastTarget,
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
        loading: pm25.loading,
        delayedCount: pm25.counts.delayed,
        expiredCount: pm25.counts.expired,
        error: pm25.error,
        onRefresh: refresh,
      }}
    >
      <div className="cp-overview-stack">
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
        <ForecastPanel
          station={stationId ? routeStation : null}
          areaLabel={
            stationId
              ? undefined
              : area
                ? (area.name ?? "บริเวณที่เลือก")
                : currentLocation.location
                  ? "ตำแหน่งของคุณ"
                  : undefined
          }
          data={forecastForCurrentTarget}
          loading={forecast.loading}
          error={forecast.error}
        />
      </div>
    </UserPageShell>
  );
}
