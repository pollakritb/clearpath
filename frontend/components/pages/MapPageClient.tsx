"use client";
import type { MapFocusPoint } from "@/frontend/types/ui";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useCurrentUserId } from "@/frontend/components/auth/AuthProvider";
import MapChrome from "@/frontend/components/app/MapChrome";
import MapStatusCard from "@/frontend/components/app/MapStatusCard";
import PlaceAirCard from "@/frontend/components/app/PlaceAirCard";
import ReportStackCard from "@/frontend/components/app/ReportStackCard";
import UserPageShell from "@/frontend/components/app/UserPageShell";
import CamsForecastControls from "@/frontend/components/map/CamsForecastControls";
import { useMapDataMode } from "@/frontend/hooks/useMapDataMode";
import { useCamsPresentation } from "@/frontend/hooks/useCamsPresentation";
import { useForecastGrid } from "@/frontend/hooks/useForecastGrid";
import type { ViewportBounds } from "@/frontend/types/ui";
import MapHistoryControls from "@/frontend/components/map/MapHistoryControls";
import MapRequestPanel from "@/frontend/components/measurement/MapRequestPanel";
import RequestMapCard from "@/frontend/components/measurement/RequestMapCard";
import { useMeasurementRequests } from "@/frontend/hooks/useMeasurementRequests";
import { useRequestPlaceLabel } from "@/frontend/hooks/useRequestPlaceLabel";
import { visibleMapRequests } from "@/frontend/lib/request-map";
import AppIcon from "@/frontend/components/ui/AppIcon";
import ListView from "@/frontend/components/panels/ListView";
import { useCommunityMapData } from "@/frontend/hooks/useCommunity";
import {
  useCurrentLocation,
  type CurrentLocation,
} from "@/frontend/hooks/useCurrentLocation";
import { FIRMS_REFRESH_MS, useFirms } from "@/frontend/hooks/useFirms";
import { useMapHistory } from "@/frontend/hooks/useMapHistory";
import { usePm25 } from "@/frontend/hooks/usePm25";
import { DEMO_COMMUNITY_CENTER } from "@/frontend/lib/demo-community";
import { haversineKm } from "@/frontend/lib/distance";
import { useOwnedReportIds } from "@/frontend/hooks/useOwnedReportIds";
import { nearestHeatmapPoint } from "@/frontend/lib/nearest-surface";
import { assessPlaceAir, PLACE_RADIUS_KM } from "@/frontend/lib/place-air";
import { countCommunitySources } from "@/frontend/lib/dashboard";
import type {
  CommunityReport,
  CommunityReportStack,
  LocationSuggestion,
  Station,
  MeasurementRequestView,
} from "@/frontend/types";
import type { ViewMode } from "@/frontend/types/ui";

const MapView = dynamic(() => import("@/frontend/components/map/MapView"), {
  ssr: false,
  loading: () => <div className="cp-centered-status">กำลังโหลดแผนที่…</div>,
});

export default function MapPageClient({
  showFiresInitially = false,
  initialReportId,
  requestInitially = false,
  active = true,
  initialCams = false,
  initialRequestId,
}: {
  showFiresInitially?: boolean;
  initialReportId?: string | null;
  requestInitially?: boolean;
  active?: boolean;
  initialCams?: boolean;
  initialRequestId?: string | null;
}) {
  const currentUserId = useCurrentUserId();
  const requestData = useMeasurementRequests(currentUserId, active);
  const openedRequestMode = useRef(false);
  const openedRequestLink = useRef<string | null>(null);
  const openedReportLink = useRef<string | null>(null);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(
    null,
  );
  const requestRows = visibleMapRequests(
    requestData.rows,
    requestData.now,
    selectedRequestId ?? initialRequestId,
  );
  const selectedRequest =
    requestRows.find((row) => row.id === selectedRequestId) ?? null;
  const pm25 = usePm25();
  const firms = useFirms();
  const community = useCommunityMapData();
  const currentLocation = useCurrentLocation(true);
  const mapHistory = useMapHistory();
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [requestStep, setRequestStep] = useState<"idle" | "pick" | "form">(
    "idle",
  );
  const [requestPoint, setRequestPoint] = useState<LocationSuggestion | null>(
    null,
  );
  const [requestRadius, setRequestRadius] = useState<1 | 3 | 5>(3);
  const requestLabel = useRequestPlaceLabel(
    requestPoint,
    requestStep !== "idle",
  );
  const [selectedReport, setSelectedReport] = useState<CommunityReport | null>(
    null,
  );
  const [selectedStackId, setSelectedStackId] = useState<string | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<LocationSuggestion | null>(
    null,
  );
  const [placeClock, setPlaceClock] = useState(() => Date.now());
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showStations, setShowStations] = useState(true);
  const [showIndividualReports, setShowIndividualReports] = useState(true);
  const [showFires, setShowFires] = useState(showFiresInitially);
  const [viewMode, setViewMode] = useState<ViewMode>("map");
  const { mode, camsEnabled, historyEnabled, setHistoryEnabled, toggleCams } =
    useMapDataMode(initialCams);
  const [viewport, setViewport] = useState<ViewportBounds | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [camsPoint, setCamsPoint] = useState<{
    lat: number;
    lon: number;
    name?: string;
  } | null>(null);
  const cams = useCamsPresentation(
    useForecastGrid(camsEnabled, active, viewport, true),
  );
  const pauseCams = cams.pause;
  const resetCamsTime = cams.now;
  const [historyAnchor, setHistoryAnchor] = useState(() => Date.now());
  const onPanelChange = useCallback(
    (open: boolean) => {
      setPanelOpen(open);
      if (open) pauseCams();
    },
    [pauseCams],
  );
  const changeCams = useCallback(() => {
    pauseCams();
    if (!camsEnabled) resetCamsTime();
    setSelectedStation(null);
    setSelectedReport(null);
    setSelectedStackId(null);
    setSelectedPlace(null);
    setSelectedRequestId(null);
    setViewMode("map");
    toggleCams();
  }, [pauseCams, toggleCams, camsEnabled, resetCamsTime]);
  useEffect(() => {
    if (active) return;
    const frame = requestAnimationFrame(pauseCams);
    return () => cancelAnimationFrame(frame);
  }, [active, pauseCams]);
  const [historyOffsetHours, setHistoryOffsetHours] = useState(1);
  const [focusPoint, setFocusPoint] = useState<MapFocusPoint | null>(null);
  const [locatedManually, setLocatedManually] =
    useState<CurrentLocation | null>(null);
  const [resetViewSignal, setResetViewSignal] = useState(0);
  const userLocation = locatedManually ?? currentLocation.location;

  const startRequest = useCallback(() => {
    setSelectedRequestId(null);
    setRequestStep("pick");
    setRequestPoint(null);
    setRequestRadius(3);
    setSelectedPlace(null);
    setSelectedStation(null);
    setSelectedReport(null);
    setSelectedStackId(null);
    pauseCams();
    if (!camsEnabled) setHistoryEnabled(false);
    setViewMode("map");
  }, [pauseCams, camsEnabled, setHistoryEnabled]);
  useEffect(() => {
    if (!requestInitially) {
      openedRequestMode.current = false;
      return;
    }
    if (openedRequestMode.current) return;
    openedRequestMode.current = true;
    const frame = window.requestAnimationFrame(startRequest);
    return () => window.cancelAnimationFrame(frame);
  }, [requestInitially, startRequest]);

  useEffect(() => {
    if (!showFiresInitially) return;
    const frame = window.requestAnimationFrame(() => setShowFires(true));
    return () => window.cancelAnimationFrame(frame);
  }, [showFiresInitially]);

  useEffect(() => {
    if (!selectedPlace) return;
    const clock = window.setInterval(() => setPlaceClock(Date.now()), 60_000);
    return () => window.clearInterval(clock);
    // Keep polling tied to focus-mode changes, not hook object identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPlace?.id]);

  const loadFires = firms.load;
  useEffect(() => {
    if (!showFires || camsEnabled || !active) return;
    if (!firms.loaded) void loadFires(1);
    const timer = window.setInterval(
      () => void loadFires(1, true),
      FIRMS_REFRESH_MS,
    );
    return () => window.clearInterval(timer);
  }, [firms.loaded, loadFires, showFires, camsEnabled, active]);

  const loadMapHistory = mapHistory.load;
  useEffect(() => {
    if (!historyEnabled) return;
    const target = new Date(historyAnchor);
    target.setMinutes(0, 0, 0);
    target.setHours(target.getHours() - historyOffsetHours);
    const timer = window.setTimeout(() => void loadMapHistory(target), 240);
    return () => window.clearTimeout(timer);
  }, [historyEnabled, historyOffsetHours, historyAnchor, loadMapHistory]);

  const serviceAreaStations = useMemo(
    () => pm25.stations.filter((station) => station.in_service_area),
    [pm25.stations],
  );
  const communitySourceCounts = useMemo(
    () => countCommunitySources(community.reports),
    [community.reports],
  );
  const selectedStack =
    (historyEnabled ? mapHistory.stacks : community.stacks).find(
      (stack) => stack.id === selectedStackId,
    ) ?? null;
  const effectiveFocusPoint =
    focusPoint ?? (community.demoMode ? DEMO_COMMUNITY_CENTER : null);
  const visibleStations = historyEnabled
    ? mapHistory.stations.filter((station) => station.in_service_area)
    : serviceAreaStations;
  // The nearest reading always uses GPS and both current public sources.
  // Map filters, place searches and history must not change the candidates.
  useEffect(() => {
    const reset = () => {
      setSelectedReport(null);
      setSelectedStackId(null);
      setSelectedRequestId(null);
    };
    window.addEventListener("cp-community-reset", reset);
    return () => window.removeEventListener("cp-community-reset", reset);
  }, []);
  const ownedReports = useOwnedReportIds(currentUserId, community.reports);
  const heatmapPoint = useMemo(
    () =>
      nearestHeatmapPoint(
        userLocation,
        pm25.stations,
        ownedReports.ready
          ? community.reports.filter(
              (report) => !ownedReports.ids.has(report.id),
            )
          : [],
        currentUserId,
      ),
    [
      userLocation,
      pm25.stations,
      community.reports,
      currentUserId,
      ownedReports.ids,
      ownedReports.ready,
    ],
  );
  const heatmapDistanceKm =
    userLocation && heatmapPoint
      ? haversineKm(
          userLocation.lat,
          userLocation.lon,
          heatmapPoint.lat,
          heatmapPoint.lon,
        )
      : null;
  const placeAir = useMemo(
    () =>
      selectedPlace && !camsEnabled && !historyEnabled
        ? assessPlaceAir(
            selectedPlace.lat,
            selectedPlace.lon,
            serviceAreaStations,
            community.reports,
            new Date(placeClock),
          )
        : null,
    [
      selectedPlace,
      serviceAreaStations,
      community.reports,
      placeClock,
      camsEnabled,
      historyEnabled,
    ],
  );
  const mapStations = placeAir
    ? placeAir.stations.map(({ station }) => station)
    : visibleStations;
  const mapReports = placeAir
    ? placeAir.reports.map(({ report }) => report)
    : historyEnabled
      ? mapHistory.reports
      : community.reports;
  const mapStacks = placeAir
    ? []
    : historyEnabled
      ? mapHistory.stacks
      : community.stacks;
  const selectedStackReports = selectedStack
    ? selectedStack.report_ids
        .map((id) => mapReports.find((report) => report.id === id))
        .filter((report): report is CommunityReport => Boolean(report))
    : [];

  const refresh = useCallback(() => {
    const tasks: Promise<unknown>[] = [pm25.refresh(), community.refresh()];
    if (showFires) tasks.push(firms.load(1));
    void Promise.allSettled(tasks);
  }, [community, firms, pm25, showFires]);

  const focusPin = useCallback((point: { lat: number; lon: number }) => {
    setFocusPoint((previous) => ({
      lat: point.lat,
      lon: point.lon,
      pin: true,
      token: (previous?.token ?? 0) + 1,
    }));
  }, []);

  const selectStation = useCallback(
    (station: Station) => {
      focusPin(station);
      setSelectedRequestId(null);
      setSelectedStation(station);
      setSelectedReport(null);
      setSelectedStackId(null);
    },
    [focusPin],
  );

  const selectReport = useCallback(
    (report: CommunityReport) => {
      focusPin(report);
      setSelectedRequestId(null);
      setSelectedReport(report);
      setSelectedStation(null);
      setSelectedStackId(null);
    },
    [focusPin],
  );

  useEffect(() => {
    if (!initialReportId) {
      openedReportLink.current = null;
      return;
    }
    if (openedReportLink.current === initialReportId) return;
    const report = community.reports.find((row) => row.id === initialReportId);
    if (!report) return;
    const frame = window.requestAnimationFrame(() => {
      openedReportLink.current = initialReportId;
      selectReport(report);
      setSelectedPlace(null);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [initialReportId, community.reports, selectReport]);

  const selectStack = useCallback(
    (stack: CommunityReportStack) => {
      focusPin(stack);
      setSelectedRequestId(null);
      setSelectedStackId(stack.id);
      setSelectedReport(null);
      setSelectedStation(null);
    },
    [focusPin],
  );

  const selectRequest = useCallback(
    (request: MeasurementRequestView) => {
      setSelectedRequestId(request.id);
      setSelectedStation(null);
      setSelectedReport(null);
      setSelectedStackId(null);
      setSelectedPlace(null);
      pauseCams();
      if (!camsEnabled) setHistoryEnabled(false);
      setFocusPoint((previous) => ({
        lat: request.lat,
        lon: request.lon,
        token: (previous?.token ?? 0) + 1,
      }));
      setViewMode("map");
    },
    [pauseCams, camsEnabled, setHistoryEnabled],
  );
  useEffect(() => {
    if (!initialRequestId || !active) {
      openedRequestLink.current = null;
      return;
    }
    if (openedRequestLink.current === initialRequestId) return;
    const request = visibleMapRequests(requestData.rows, requestData.now).find(
      (row) => row.id === initialRequestId,
    );
    if (!request || request.status === "cancelled") return;
    const frame = window.requestAnimationFrame(() => {
      openedRequestLink.current = initialRequestId;
      selectRequest(request);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [
    initialRequestId,
    active,
    requestData.rows,
    requestData.now,
    selectRequest,
  ]);

  const map = (
    <main className="cp-map" data-mode={mode}>
      <MapView
        dataMode={mode}
        camsSurface={camsEnabled ? cams.surface : null}
        camsPreload={camsEnabled ? cams.preloadSurfaces : undefined}
        camsPoint={camsEnabled && requestStep === "idle" ? camsPoint : null}
        onViewportChange={setViewport}
        stations={mapStations}
        heatmapPoint={heatmapPoint}
        fires={
          requestStep === "idle" &&
          !selectedPlace &&
          !historyEnabled &&
          !camsEnabled &&
          showFires
            ? firms.fires
            : []
        }
        reports={mapReports}
        reportStacks={mapStacks}
        reportPin={null}
        measurementRequests={
          requestStep === "idle" && !historyEnabled ? requestRows : []
        }
        selectedRequestId={selectedRequestId}
        requestsNow={requestData.now}
        onSelectRequest={selectRequest}
        requestRadiusKm={selectedRequest?.radius_km}
        userLocation={userLocation}
        locationUnavailable={
          !userLocation &&
          (currentLocation.status === "denied" ||
            currentLocation.status === "unavailable")
        }
        focusPoint={
          requestStep !== "idle" && requestPoint
            ? requestPoint
            : effectiveFocusPoint
        }
        placePoint={
          requestStep !== "idle" && requestPoint
            ? {
                lat: requestPoint.lat,
                lon: requestPoint.lon,
                radiusKm: requestRadius,
              }
            : selectedPlace
              ? {
                  lat: selectedPlace.lat,
                  lon: selectedPlace.lon,
                  radiusKm: PLACE_RADIUS_KM,
                }
              : null
        }
        resetViewSignal={resetViewSignal}
        showHeatmap={
          requestStep === "idle" &&
          !camsEnabled &&
          !historyEnabled &&
          showHeatmap
        }
        showStations={
          requestStep === "idle" &&
          !camsEnabled &&
          (Boolean(selectedPlace) || showStations)
        }
        showIndividualReports={
          requestStep === "idle" &&
          !camsEnabled &&
          (Boolean(selectedPlace) || showIndividualReports)
        }
        onMapClick={(lat, lon) => {
          if (requestStep === "pick") {
            setRequestPoint({
              id: `point:${lat}:${lon}`,
              name: "จุดที่เลือกบนแผนที่",
              address: "",
              kind: "point",
              source: "local",
              lat,
              lon,
            });
            return;
          }
          if (requestStep === "form") return;
          if (camsEnabled) {
            pauseCams();
            setSelectedRequestId(null);
            setCamsPoint({ lat, lon });
            return;
          }
          setSelectedRequestId(null);
          if (!selectedPlace) setFocusPoint({ lat, lon });
          setSelectedStation(null);
          setSelectedReport(null);
          setSelectedStackId(null);
        }}
        onSelectStation={selectStation}
        onSelectReport={selectReport}
        onSelectReportStack={selectStack}
        selectedStationId={selectedStation?.id}
        selectedReportId={selectedReport?.id}
        selectedReportStackId={selectedStack?.id}
        onLocate={(lat, lon, accuracy = 0) => {
          setSelectedRequestId(null);
          setSelectedPlace(null);
          setSelectedStackId(null);
          setSelectedReport(null);
          setLocatedManually({ lat, lon, accuracy });
          setFocusPoint({ lat, lon });
        }}
        onResetView={() => {
          setSelectedRequestId(null);
          setRequestStep("idle");
          setSelectedStation(null);
          setSelectedReport(null);
          setSelectedStackId(null);
          setSelectedPlace(null);
          setFocusPoint(null);
          setViewMode("map");
          setResetViewSignal((value) => value + 1);
        }}
      />
      {requestStep === "idle" && (
        <button
          type="button"
          className="cp-map-request-button cp-focus"
          onClick={startRequest}
        >
          <AppIcon name="community" size={18} /> ขอค่าฝุ่น
        </button>
      )}
      <MapChrome
        camsEnabled={camsEnabled}
        onToggleCams={changeCams}
        onPanelChange={onPanelChange}
        viewMode={viewMode}
        stationCount={visibleStations.length}
        individualReportCount={
          historyEnabled
            ? countCommunitySources(mapHistory.reports).individual
            : communitySourceCounts.individual
        }
        fireCount={historyEnabled ? 0 : firms.fires.length}
        fireStatus={firms.status}
        demoMode={community.demoMode}
        stations={historyEnabled ? visibleStations : serviceAreaStations}
        showHeatmap={showHeatmap}
        heatmapDistanceKm={heatmapDistanceKm}
        heatmapStatus={
          userLocation
            ? heatmapPoint
              ? "ready"
              : "no_data"
            : currentLocation.status === "denied"
              ? "location_denied"
              : currentLocation.status === "unavailable"
                ? "location_unavailable"
                : "no_location"
        }
        showStations={showStations}
        showIndividualReports={showIndividualReports}
        showFires={historyEnabled ? false : showFires}
        onViewModeChange={setViewMode}
        onToggleHeatmap={() => setShowHeatmap((value) => !value)}
        onToggleStations={() => setShowStations((value) => !value)}
        onToggleIndividualReports={() =>
          setShowIndividualReports((value) => !value)
        }
        onToggleFires={() => setShowFires((value) => !value)}
        onLocationSelect={(location: LocationSuggestion) => {
          setSelectedRequestId(null);
          if (requestStep !== "idle") {
            setRequestPoint(location);
            setRequestStep("pick");
            setFocusPoint({ lat: location.lat, lon: location.lon });
            return;
          }
          if (camsEnabled) {
            pauseCams();
            setCamsPoint({
              lat: location.lat,
              lon: location.lon,
              name: location.name,
            });
            setFocusPoint({ lat: location.lat, lon: location.lon });
            setViewMode("map");
            return;
          }
          setPlaceClock(Date.now());
          setHistoryEnabled(false);
          mapHistory.clear();
          setSelectedStation(null);
          setSelectedReport(null);
          setSelectedStackId(null);
          setSelectedPlace(location);
          setFocusPoint({ lat: location.lat, lon: location.lon });
          setViewMode("map");
        }}
        onStationSelect={(station) => {
          if (requestStep !== "idle") {
            setRequestPoint({
              id: `station:${station.id}`,
              name: station.name_th ?? station.name_en ?? station.id,
              address: station.province ?? "",
              kind: "station",
              source: "local",
              lat: station.lat,
              lon: station.lon,
            });
            setRequestStep("pick");
            setFocusPoint({ lat: station.lat, lon: station.lon });
            return;
          }
          if (camsEnabled) {
            pauseCams();
            setCamsPoint({
              lat: station.lat,
              lon: station.lon,
              name: station.name_th ?? station.name_en ?? station.id,
            });
            setFocusPoint({ lat: station.lat, lon: station.lon });
            return;
          }
          setSelectedPlace(null);
          selectStation(station);
          setViewMode("map");
        }}
      />
      {requestStep === "idle" && viewMode === "list" && (
        <ListView
          stations={mapStations}
          onSelectStation={(station) => {
            selectStation(station);
            setViewMode("map");
          }}
        />
      )}
      {requestStep !== "idle" ? (
        <MapRequestPanel
          onCreated={(row) => {
            requestData.upsert(row);
            setRequestStep("idle");
            selectRequest(row);
          }}
          radius={requestRadius}
          onRadiusChange={setRequestRadius}
          point={requestLabel.point}
          resolvingName={requestLabel.loading}
          editing={requestStep === "form"}
          onConfirm={() => setRequestStep("form")}
          onReselect={() => setRequestStep("pick")}
          onClose={() => setRequestStep("idle")}
        />
      ) : selectedRequest && !camsEnabled ? (
        <RequestMapCard
          request={selectedRequest}
          onUpdated={(row) => {
            requestData.upsert(row);
            if (row.status === "cancelled") setSelectedRequestId(null);
          }}
          now={requestData.now}
          onClose={() => setSelectedRequestId(null)}
        />
      ) : camsEnabled ? (
        !panelOpen && (
          <CamsForecastControls
            requestCard={
              selectedRequest ? (
                <RequestMapCard
                  request={selectedRequest}
                  now={requestData.now}
                  onClose={() => setSelectedRequestId(null)}
                  onUpdated={(row) => {
                    requestData.upsert(row);
                    if (row.status === "cancelled") setSelectedRequestId(null);
                  }}
                />
              ) : null
            }
            grid={cams}
            point={camsPoint}
            onClosePoint={() => setCamsPoint(null)}
            onExit={changeCams}
            onRequest={() => {
              if (!camsPoint) return;
              startRequest();
              setRequestPoint({
                id: `cams:${camsPoint.lat}:${camsPoint.lon}`,
                lat: camsPoint.lat,
                lon: camsPoint.lon,
                name: camsPoint.name ?? "จุดที่เลือกบนแผนที่",
                address: "",
                kind: camsPoint.name ? "place" : "point",
                source: "local",
              });
              setRequestStep("form");
            }}
          />
        )
      ) : selectedPlace && placeAir && !selectedReport && !selectedStation ? (
        <PlaceAirCard
          place={selectedPlace}
          onRequestMeasurement={() => {
            startRequest();
            setRequestPoint(selectedPlace);
            setRequestStep("form");
          }}
          air={placeAir}
          onSelectStation={selectStation}
          onSelectReport={selectReport}
          loading={pm25.loading}
          dataError={pm25.error}
          onClose={() => {
            setSelectedPlace(null);
            setFocusPoint(null);
          }}
        />
      ) : selectedStack && !selectedReport && !selectedStation ? (
        <ReportStackCard
          stack={selectedStack}
          reports={selectedStackReports}
          onSelectReport={(report) => {
            setSelectedReport(report);
            focusPin(report);
          }}
          onClose={() => setSelectedStackId(null)}
        />
      ) : historyEnabled && !selectedStation && !selectedReport ? (
        <MapHistoryControls
          paused={!active || panelOpen}
          offsetHours={historyOffsetHours}
          targetAt={mapHistory.targetAt}
          stationCount={visibleStations.length}
          reportCount={mapHistory.reports.length}
          loading={mapHistory.loading}
          error={mapHistory.error}
          onOffsetChange={(hours) => {
            setHistoryOffsetHours(hours);
            setSelectedStation(null);
            setSelectedReport(null);
            setSelectedStackId(null);
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
          key={selectedReport?.id ?? selectedStation?.id ?? "map-current"}
          station={selectedStation}
          report={selectedReport}
          updatedAt={pm25.updatedAt}
          historicalAt={historyEnabled ? mapHistory.targetAt : null}
          onOpenHistory={
            historyEnabled || selectedPlace
              ? undefined
              : () => {
                  setHistoryAnchor(Date.now());
                  setHistoryEnabled(true);
                  setSelectedStation(null);
                  setSelectedReport(null);
                }
          }
          onClose={() => {
            setSelectedStation(null);
            setSelectedReport(null);
          }}
          onBackToPlace={
            selectedStack && selectedReport
              ? () => setSelectedReport(null)
              : selectedPlace
                ? () => {
                    setSelectedStation(null);
                    setSelectedReport(null);
                  }
                : undefined
          }
          backLabel={selectedStack ? "กลับไปยังกลุ่มรายงาน" : undefined}
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
