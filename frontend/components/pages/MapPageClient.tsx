"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";

import MapChrome from "@/frontend/components/app/MapChrome";
import MapStatusCard from "@/frontend/components/app/MapStatusCard";
import UserPageShell from "@/frontend/components/app/UserPageShell";
import MapHistoryControls from "@/frontend/components/map/MapHistoryControls";
import ListView from "@/frontend/components/panels/ListView";
import { useDisplayPreferences } from "@/frontend/components/settings/DisplayPreferencesProvider";
import { useCommunityMapData } from "@/frontend/hooks/useCommunity";
import { FIRMS_REFRESH_MS, useFirms } from "@/frontend/hooks/useFirms";
import { useMapHistory } from "@/frontend/hooks/useMapHistory";
import { usePm25 } from "@/frontend/hooks/usePm25";
import { DEMO_COMMUNITY_CENTER } from "@/frontend/lib/demo-community";
import {
  buildCurrentSurfaceStations,
  countCommunitySources,
} from "@/frontend/lib/dashboard";
import type {
  CommunityReport,
  LocationSuggestion,
  Station,
} from "@/frontend/types";
import type { ViewMode } from "@/frontend/types/ui";

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
  const community = useCommunityMapData();
  const mapHistory = useMapHistory();
  const display = useDisplayPreferences();
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [selectedReport, setSelectedReport] = useState<CommunityReport | null>(
    null,
  );
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showStations, setShowStations] = useState(true);
  const [showIndividualReports, setShowIndividualReports] = useState(true);
  const [showFires, setShowFires] = useState(showFiresInitially);
  const [viewMode, setViewMode] = useState<ViewMode>("map");
  const [historyEnabled, setHistoryEnabled] = useState(false);
  const [historyOffsetHours, setHistoryOffsetHours] = useState(1);
  const [focusPoint, setFocusPoint] = useState<{
    lat: number;
    lon: number;
  } | null>(null);

  const loadFires = firms.load;
  useEffect(() => {
    if (!showFires) return;
    if (!firms.loaded) void loadFires(1);
    const timer = window.setInterval(() => void loadFires(1), FIRMS_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [firms.loaded, loadFires, showFires]);

  const loadMapHistory = mapHistory.load;
  useEffect(() => {
    if (!historyEnabled) return;
    const target = new Date();
    target.setMinutes(0, 0, 0);
    target.setHours(target.getHours() - historyOffsetHours);
    const timer = window.setTimeout(() => void loadMapHistory(target), 240);
    return () => window.clearTimeout(timer);
  }, [historyEnabled, historyOffsetHours, loadMapHistory]);

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
  const visibleStations = historyEnabled
    ? mapHistory.stations.filter((station) => station.in_service_area)
    : serviceAreaStations;
  const visibleSurfaceStations = historyEnabled
    ? visibleStations.filter((station) => station.eligible_for_surface)
    : currentSurfaceStations;

  const refresh = useCallback(() => {
    const tasks: Promise<unknown>[] = [pm25.refresh(), community.refresh()];
    if (showFires) tasks.push(firms.load(1));
    void Promise.allSettled(tasks);
  }, [community, firms, pm25, showFires]);

  const selectStation = useCallback((station: Station) => {
    setSelectedStation(station);
    setSelectedReport(null);
  }, []);

  const selectReport = useCallback((report: CommunityReport) => {
    setSelectedReport(report);
    setSelectedStation(null);
  }, []);

  const map = (
    <main className="cp-map">
      <MapView
        stations={visibleStations}
        surfaceStations={visibleSurfaceStations}
        fires={!historyEnabled && showFires ? firms.fires : []}
        reports={historyEnabled ? [] : community.reports}
        reportPin={null}
        focusPoint={effectiveFocusPoint}
        showHeatmap={showHeatmap}
        showStations={showStations}
        showIndividualReports={!historyEnabled && showIndividualReports}
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
      />
      <MapChrome
        viewMode={viewMode}
        stationCount={visibleStations.length}
        individualReportCount={
          historyEnabled ? 0 : communitySourceCounts.individual
        }
        fireCount={historyEnabled ? 0 : firms.fires.length}
        fireStatus={firms.status}
        demoMode={community.demoMode}
        stations={serviceAreaStations}
        bigText={display.bigText}
        showHeatmap={showHeatmap}
        showStations={showStations}
        showIndividualReports={historyEnabled ? false : showIndividualReports}
        showFires={historyEnabled ? false : showFires}
        onViewModeChange={setViewMode}
        onToggleBigText={() => display.setBigText(!display.bigText)}
        onToggleHeatmap={() => setShowHeatmap((value) => !value)}
        onToggleStations={() => setShowStations((value) => !value)}
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
          stations={visibleStations}
          onSelectStation={(station) => {
            selectStation(station);
            setViewMode("map");
          }}
        />
      )}
      {historyEnabled && !selectedStation ? (
        <MapHistoryControls
          offsetHours={historyOffsetHours}
          targetAt={mapHistory.targetAt}
          stationCount={visibleStations.length}
          loading={mapHistory.loading}
          error={mapHistory.error}
          onOffsetChange={(hours) => {
            setHistoryOffsetHours(hours);
            setSelectedStation(null);
          }}
          onReturnCurrent={() => {
            setHistoryEnabled(false);
            setHistoryOffsetHours(1);
            mapHistory.clear();
            setSelectedStation(null);
          }}
        />
      ) : (
        <MapStatusCard
          station={selectedStation}
          report={selectedReport}
          updatedAt={pm25.updatedAt}
          historicalAt={historyEnabled ? mapHistory.targetAt : null}
          onOpenHistory={
            historyEnabled
              ? undefined
              : () => {
                  setHistoryEnabled(true);
                  setSelectedStation(null);
                  setSelectedReport(null);
                }
          }
          onClose={() => {
            setSelectedStation(null);
            setSelectedReport(null);
          }}
        />
      )}
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
