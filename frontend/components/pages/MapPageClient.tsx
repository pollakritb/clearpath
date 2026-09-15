"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";

import MapChrome from "@/frontend/components/app/MapChrome";
import MapStatusCard from "@/frontend/components/app/MapStatusCard";
import UserPageShell from "@/frontend/components/app/UserPageShell";
import ListView from "@/frontend/components/panels/ListView";
import { useDisplayPreferences } from "@/frontend/components/settings/DisplayPreferencesProvider";
import { useCommunityMapData } from "@/frontend/hooks/useCommunity";
import { useFirms } from "@/frontend/hooks/useFirms";
import { useForecastSurface } from "@/frontend/hooks/useForecastSurface";
import { usePm25 } from "@/frontend/hooks/usePm25";
import { DEMO_COMMUNITY_CENTER } from "@/frontend/lib/demo-community";
import {
  buildCurrentSurfaceStations,
  buildForecastSurfaceStations,
  countCommunitySources,
} from "@/frontend/lib/dashboard";
import type {
  CommunityReport,
  LocationSuggestion,
  Station,
} from "@/frontend/types";
import type { ViewMode, ViewportBounds } from "@/frontend/types/ui";

const MapView = dynamic(() => import("@/frontend/components/map/MapView"), {
  ssr: false,
  loading: () => <div className="cp-centered-status">กำลังโหลดแผนที่…</div>,
});

export default function MapPageClient({
  showFiresInitially = false,
}: {
  showFiresInitially?: boolean;
}) {
  const pm25 = usePm25();
  const firms = useFirms();
  const forecastSurface = useForecastSurface();
  const community = useCommunityMapData();
  const display = useDisplayPreferences();
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [selectedReport, setSelectedReport] = useState<CommunityReport | null>(
    null,
  );
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showStations, setShowStations] = useState(true);
  const [showCommunitySensors, setShowCommunitySensors] = useState(true);
  const [showIndividualReports, setShowIndividualReports] = useState(true);
  const [showFires, setShowFires] = useState(showFiresInitially);
  const [viewMode, setViewMode] = useState<ViewMode>("map");
  const [mapHorizon, setMapHorizon] = useState<0 | 1 | 3 | 6 | 12 | 24>(0);
  const [focusPoint, setFocusPoint] = useState<{
    lat: number;
    lon: number;
  } | null>(null);
  const [mapBounds, setMapBounds] = useState<ViewportBounds | null>(null);

  const loadFires = firms.load;
  useEffect(() => {
    if (showFires && !firms.loaded) void loadFires(1);
  }, [firms.loaded, loadFires, showFires]);

  const serviceAreaStations = useMemo(
    () => pm25.stations.filter((station) => station.in_service_area),
    [pm25.stations],
  );
  const communitySourceCounts = useMemo(
    () => countCommunitySources(community.reports),
    [community.reports],
  );
  const effectiveFocusPoint =
    focusPoint ?? (community.demoMode ? DEMO_COMMUNITY_CENTER : null);
  const currentSurfaceStations = useMemo(
    () => buildCurrentSurfaceStations(pm25.stations, community.mapPoints),
    [community.mapPoints, pm25.stations],
  );

  const forecastSurfaceLoad = forecastSurface.load;
  const forecastSurfaceClear = forecastSurface.clear;
  useEffect(() => {
    if (mapHorizon === 0) {
      forecastSurfaceClear();
      return;
    }
    if (mapBounds) void forecastSurfaceLoad(mapHorizon, mapBounds);
  }, [forecastSurfaceClear, forecastSurfaceLoad, mapBounds, mapHorizon]);

  const forecastSurfaceStations = useMemo(
    () => buildForecastSurfaceStations(forecastSurface.data, mapHorizon),
    [forecastSurface.data, mapHorizon],
  );
  const surfaceStations =
    mapHorizon === 0 ? currentSurfaceStations : forecastSurfaceStations;

  const refresh = useCallback(() => {
    const tasks: Promise<unknown>[] = [pm25.refresh(), community.refresh()];
    if (showFires) tasks.push(firms.load(1));
    void Promise.allSettled(tasks);
  }, [community, firms, pm25, showFires]);

  const selectStation = useCallback((station: Station) => {
    setSelectedStation(station);
    setSelectedReport(null);
    setMapHorizon(0);
  }, []);

  const selectReport = useCallback((report: CommunityReport) => {
    setSelectedReport(report);
    setSelectedStation(null);
    setMapHorizon(0);
  }, []);

  const map = (
    <main className="cp-map">
      <MapView
        stations={serviceAreaStations}
        surfaceStations={surfaceStations}
        fires={showFires ? firms.fires : []}
        reports={community.reports}
        reportPin={null}
        focusPoint={effectiveFocusPoint}
        showHeatmap={showHeatmap}
        showStations={showStations}
        showCommunitySensors={showCommunitySensors}
        showIndividualReports={showIndividualReports}
        onMapClick={(lat, lon) => {
          setFocusPoint({ lat, lon });
          setSelectedStation(null);
          setSelectedReport(null);
        }}
        onSelectStation={selectStation}
        onSelectReport={selectReport}
        selectedStationId={selectedStation?.id}
        selectedReportId={selectedReport?.id}
        onLocate={(lat, lon) => setFocusPoint({ lat, lon })}
        onViewportChange={setMapBounds}
      />
      <MapChrome
        viewMode={viewMode}
        stationCount={serviceAreaStations.length}
        sensorCount={communitySourceCounts.sensor}
        individualReportCount={communitySourceCounts.individual}
        fireCount={firms.fires.length}
        fireAvailable={!firms.error}
        demoMode={community.demoMode}
        stations={serviceAreaStations}
        bigText={display.bigText}
        showHeatmap={showHeatmap}
        showStations={showStations}
        showCommunitySensors={showCommunitySensors}
        showIndividualReports={showIndividualReports}
        showFires={showFires}
        onViewModeChange={setViewMode}
        onToggleBigText={() => display.setBigText(!display.bigText)}
        onToggleHeatmap={() => setShowHeatmap((value) => !value)}
        onToggleStations={() => setShowStations((value) => !value)}
        onToggleCommunitySensors={() =>
          setShowCommunitySensors((value) => !value)
        }
        onToggleIndividualReports={() =>
          setShowIndividualReports((value) => !value)
        }
        onToggleFires={() => setShowFires((value) => !value)}
        onLocationSelect={(location: LocationSuggestion) => {
          setFocusPoint({ lat: location.lat, lon: location.lon });
          setViewMode("map");
        }}
        onStationSelect={(station) => {
          selectStation(station);
          setFocusPoint({ lat: station.lat, lon: station.lon });
          setViewMode("map");
        }}
      />
      {viewMode === "list" && (
        <ListView
          stations={serviceAreaStations}
          onSelectStation={(station) => {
            selectStation(station);
            setViewMode("map");
          }}
        />
      )}
      <MapStatusCard
        station={selectedStation}
        report={selectedReport}
        updatedAt={pm25.updatedAt}
        horizon={mapHorizon}
        forecastLoading={forecastSurface.loading}
        forecastError={forecastSurface.error}
        forecastWarnings={forecastSurface.data?.warnings ?? []}
        onHorizonChange={setMapHorizon}
        onClose={() => {
          setSelectedStation(null);
          setSelectedReport(null);
        }}
      />
    </main>
  );

  return (
    <UserPageShell
      tab="map"
      icon="map"
      main={map}
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
      {community.error && (
        <p role="alert" className="cp-inline-error">
          {community.error}
        </p>
      )}
    </UserPageShell>
  );
}
