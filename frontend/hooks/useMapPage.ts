"use client";
import { api, apiErrorMessage } from "@/frontend/lib/api-client";
import { ageStation } from "@/frontend/lib/station-age";
import { useMissionMapLink } from "./useMissionMapLink";
import type { MapFocusPoint } from "@/frontend/types/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCurrentUserId } from "@/frontend/components/auth/AuthProvider";
import { useMapDataMode } from "@/frontend/hooks/useMapDataMode";
import { useCamsPresentation } from "@/frontend/hooks/useCamsPresentation";
import { useForecastGrid } from "@/frontend/hooks/useForecastGrid";
import type { ViewportBounds } from "@/frontend/types/ui";
import { useMeasurementRequests } from "@/frontend/hooks/useMeasurementRequests";
import { useRequestPlaceLabel } from "@/frontend/hooks/useRequestPlaceLabel";
import { visibleMapRequests } from "@/frontend/lib/request-map";
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
import { assessPlaceAir } from "@/frontend/lib/place-air";
import { countCommunitySources } from "@/frontend/lib/dashboard";
import type {
  CommunityReport,
  CommunityReportStack,
  LocationSuggestion,
  Station,
  MeasurementRequestView,
} from "@/frontend/types";
import type { ViewMode } from "@/frontend/types/ui";

export type MapPageOptions = {
  showFiresInitially?: boolean;
  initialReportId?: string | null;
  initialReportRequestId?: string | null;
  initialMissionLink?: string | null;
  requestInitially?: boolean;
  active?: boolean;
  initialCams?: boolean;
  initialRequestId?: string | null;
};

export function useMapPage({
  showFiresInitially = false,
  initialReportId,
  initialReportRequestId,
  initialMissionLink,
  requestInitially = false,
  active = true,
  initialCams = false,
  initialRequestId,
}: MapPageOptions) {
  const [target, setTarget] = useState<
    | { kind: "station"; value: Station }
    | { kind: "report"; value: CommunityReport }
    | { kind: "request"; value: string }
    | null
  >(null);
  const selectedStation = target?.kind === "station" ? target.value : null;
  const selectedReport = target?.kind === "report" ? target.value : null;
  const selectedRequestId = target?.kind === "request" ? target.value : null;
  const setSelectedStation = useCallback((value: Station | null) => {
    setTarget((current) =>
      value
        ? { kind: "station", value }
        : current?.kind === "station"
          ? null
          : current,
    );
  }, []);
  const setSelectedReport = useCallback((value: CommunityReport | null) => {
    setTarget((current) =>
      value
        ? { kind: "report", value }
        : current?.kind === "report"
          ? null
          : current,
    );
  }, []);
  const setSelectedRequestId = useCallback((value: string | null) => {
    setTarget((current) =>
      value
        ? { kind: "request", value }
        : current?.kind === "request"
          ? null
          : current,
    );
  }, []);
  const currentUserId = useCurrentUserId();
  const requestData = useMeasurementRequests(currentUserId, active);
  const openedRequestMode = useRef(false);
  const openedRequestLink = useRef<string | null>(null);
  const openedReportLink = useRef<string | null>(null);
  const [reportLinkError, setReportLinkError] = useState<string | null>(null);
  const requestRows = useMemo(
    () => visibleMapRequests(requestData.rows, requestData.now),
    [requestData.rows, requestData.now],
  );
  const selectedRequest =
    requestRows.find((row) => row.id === selectedRequestId) ?? null;
  const pm25 = usePm25();
  const firms = useFirms();
  const community = useCommunityMapData();
  const currentLocation = useCurrentLocation(true);
  const mapHistory = useMapHistory();
  const [requestStep, setRequestStep] = useState<
    "idle" | "search" | "pick" | "form"
  >("idle");
  const [requestPoint, setRequestPoint] = useState<LocationSuggestion | null>(
    null,
  );
  const requestRadius = 2 as const;
  const requestLabel = useRequestPlaceLabel(
    requestPoint,
    requestStep !== "idle",
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
  const {
    mode,
    camsEnabled,
    historyEnabled,
    setHistoryEnabled,
    toggleCams,
    setMode,
  } = useMapDataMode(initialCams);
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
  }, [
    pauseCams,
    toggleCams,
    camsEnabled,
    resetCamsTime,
    setSelectedStation,
    setSelectedReport,
    setSelectedRequestId,
  ]);
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
    setRequestStep("search");
    setRequestPoint(null);
    setSelectedPlace(null);
    setSelectedStation(null);
    setSelectedReport(null);
    setSelectedStackId(null);
    pauseCams();
    if (!camsEnabled) setHistoryEnabled(false);
    setViewMode("map");
  }, [
    pauseCams,
    camsEnabled,
    setHistoryEnabled,
    setSelectedStation,
    setSelectedReport,
    setSelectedRequestId,
  ]);
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
  }, [setSelectedReport, setSelectedRequestId]);
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

  const selectMissionPlace = useCallback(
    (point: LocationSuggestion) => {
      setRequestStep("idle");
      setSelectedPlace(point);
      setSelectedStackId(null);
      setTarget(null);
      setMode("current");
      focusPin(point);
    },
    [focusPin, setMode],
  );
  useMissionMapLink(initialMissionLink, active, selectMissionPlace);

  const selectStation = useCallback(
    (station: Station) => {
      focusPin(station);
      setSelectedRequestId(null);
      setSelectedStation(station);
      setSelectedReport(null);
      setSelectedStackId(null);
    },
    [focusPin, setSelectedStation, setSelectedReport, setSelectedRequestId],
  );

  const selectReport = useCallback(
    (report: CommunityReport) => {
      focusPin(report);
      setSelectedRequestId(null);
      setSelectedReport(report);
      setSelectedStation(null);
      setSelectedStackId(null);
    },
    [focusPin, setSelectedStation, setSelectedReport, setSelectedRequestId],
  );

  useEffect(() => {
    if (!initialReportId) {
      openedReportLink.current = null;
      return;
    }
    if (openedReportLink.current === initialReportId) return;
    let cancelled = false;
    const report = community.reports.find((row) => row.id === initialReportId);
    void Promise.resolve(
      report ?? api.reportDetail(initialReportId, initialReportRequestId),
    )
      .then((resolved) => {
        if (cancelled) return;
        openedReportLink.current = initialReportId;
        setReportLinkError(null);
        selectReport(resolved);
        setSelectedPlace(null);
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setReportLinkError(
            apiErrorMessage(error, "เปิดรายงานไม่สำเร็จ กรุณาลองใหม่"),
          );
      });
    return () => {
      cancelled = true;
    };
  }, [
    initialReportId,
    initialReportRequestId,
    currentUserId,
    community.reports,
    selectReport,
  ]);

  const selectStack = useCallback(
    (stack: CommunityReportStack) => {
      focusPin(stack);
      setSelectedRequestId(null);
      setSelectedStackId(stack.id);
      setSelectedReport(null);
      setSelectedStation(null);
    },
    [focusPin, setSelectedStation, setSelectedReport, setSelectedRequestId],
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
    [
      pauseCams,
      camsEnabled,
      setHistoryEnabled,
      setSelectedStation,
      setSelectedReport,
      setSelectedRequestId,
    ],
  );
  useEffect(() => {
    if (!initialRequestId || !active) {
      openedRequestLink.current = null;
      return;
    }
    if (openedRequestLink.current === initialRequestId) return;
    const request = requestRows.find((row) => row.id === initialRequestId);
    if (!request || request.status === "cancelled") return;
    const frame = window.requestAnimationFrame(() => {
      openedRequestLink.current = initialRequestId;
      selectRequest(request);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [initialRequestId, active, requestRows, selectRequest]);

  return {
    reportLinkError,
    active,
    selectedStation:
      selectedStation && !historyEnabled
        ? (pm25.stations.find((station) => station.id === selectedStation.id) ??
          ageStation(selectedStation, placeClock))
        : selectedStation,
    selectedReport,
    selectedRequestId,
    setSelectedStation,
    setSelectedReport,
    setSelectedRequestId,
    requestData,
    requestRows,
    selectedRequest,
    pm25,
    firms,
    community,
    currentLocation,
    mapHistory,
    requestStep,
    setRequestStep,
    requestPoint,
    setRequestPoint,
    requestRadius,
    requestLabel,
    setSelectedStackId,
    selectedPlace,
    setSelectedPlace,
    setPlaceClock,
    showHeatmap,
    setShowHeatmap,
    showStations,
    setShowStations,
    showIndividualReports,
    setShowIndividualReports,
    showFires,
    setShowFires,
    viewMode,
    setViewMode,
    mode,
    setDataMode: setMode,
    camsEnabled,
    historyEnabled,
    setHistoryEnabled,
    setViewport,
    panelOpen,
    camsPoint,
    setCamsPoint,
    cams,
    pauseCams,
    setHistoryAnchor,
    onPanelChange,
    changeCams,
    historyOffsetHours,
    setHistoryOffsetHours,
    focusPoint,
    setFocusPoint,
    setLocatedManually,
    resetViewSignal,
    setResetViewSignal,
    userLocation,
    startRequest,
    serviceAreaStations,
    communitySourceCounts,
    selectedStack,
    effectiveFocusPoint,
    visibleStations,
    heatmapPoint,
    heatmapDistanceKm,
    placeAir,
    mapStations,
    mapReports,
    mapStacks,
    selectedStackReports,
    refresh,
    focusPin,
    selectStation,
    selectReport,
    selectStack,
    selectRequest,
  };
}
