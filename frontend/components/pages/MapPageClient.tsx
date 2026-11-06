"use client";
import dynamic from "next/dynamic";
import { useCurrentUserId } from "@/frontend/components/auth/AuthProvider";
import { useSavedHelperLocations } from "@/frontend/hooks/useSavedHelperLocations";
import noticeStyles from "./MapLinkNotice.module.css";
import { useCallback, useEffect, useState } from "react";
import MapChrome from "@/frontend/components/app/MapChrome";
import MapStatusCard from "@/frontend/components/app/MapStatusCard";
import PlaceAirCard from "@/frontend/components/app/PlaceAirCard";
import ReportStackCard from "@/frontend/components/app/ReportStackCard";
import UserPageShell from "@/frontend/components/app/UserPageShell";
import CamsForecastControls from "@/frontend/components/map/CamsForecastControls";
import StationTimelineControls from "@/frontend/components/map/StationTimelineControls";
import { gridValue, nearestTime } from "@/frontend/lib/forecast-grid";
import type {
  StationTime,
  StationTimeMode,
} from "@/frontend/lib/station-timeline";
import MapHistoryControls from "@/frontend/components/map/MapHistoryControls";
import RequestPlaceSearch from "@/frontend/components/measurement/RequestPlaceSearch";
import MapRequestPanel from "@/frontend/components/measurement/MapRequestPanel";
import RequestMapCard from "@/frontend/components/measurement/RequestMapCard";
import AppIcon from "@/frontend/components/ui/AppIcon";
import ListView from "@/frontend/components/panels/ListView";
import { PLACE_RADIUS_KM } from "@/frontend/lib/place-air";
import { countCommunitySources } from "@/frontend/lib/dashboard";
import type { LocationSuggestion } from "@/frontend/types";
import { useMapPage, type MapPageOptions } from "@/frontend/hooks/useMapPage";

const MapView = dynamic(() => import("@/frontend/components/map/MapView"), {
  ssr: false,
  loading: () => <div className="cp-centered-status">กำลังโหลดแผนที่…</div>,
});

export default function MapPageClient(options: MapPageOptions) {
  const savedHelperLocations = useSavedHelperLocations(
    useCurrentUserId(),
    options.active ?? true,
  );
  const {
    active,
    reportLinkError,
    selectedStation,
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
    setDataMode,
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
  } = useMapPage(options);

  const [historyStation, setHistoryStation] = useState<{
    id: string;
    name: string;
    lat: number;
    lon: number;
  } | null>(null);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [timelineMode, setTimelineMode] = useState<StationTimeMode>("history");
  const [timelineAnchor, setTimelineAnchor] = useState(
    () => Math.floor(Date.now() / 3600000) * 3600000,
  );
  const [timelineTime, setTimelineTime] = useState<StationTime>({
    kind: "current",
  });
  const selectStationTime = useCallback(
    (next: StationTime) => {
      setTimelineTime(next);
      if (next.kind === "history") setHistoryOffsetHours(next.hours);
      setDataMode(
        next.kind === "forecast"
          ? "cams"
          : next.kind === "history"
            ? "history"
            : "current",
      );
    },
    [setHistoryOffsetHours, setDataMode],
  );
  const {
    times: camsTimes,
    requestedAt: camsRequestedAt,
    select: selectCamsTime,
  } = cams;
  useEffect(() => {
    if (!timelineOpen || timelineTime.kind !== "forecast" || !camsTimes.length)
      return;
    const at = nearestTime(camsTimes, timelineTime.at);
    const frame = requestAnimationFrame(() => {
      if (at && at !== timelineTime.at)
        setTimelineTime({ kind: "forecast", at });
      else if (camsRequestedAt !== timelineTime.at)
        selectCamsTime(timelineTime.at);
    });
    return () => cancelAnimationFrame(frame);
  }, [timelineOpen, timelineTime, camsTimes, camsRequestedAt, selectCamsTime]);
  const forecastTimeError =
    cams.error ??
    (cams.noFrame || cams.unavailable
      ? "ไม่มีข้อมูลพยากรณ์ในเวลาที่เลือก"
      : null);
  const timelineLoading =
    timelineTime.kind === "history"
      ? mapHistory.loading
      : timelineTime.kind === "forecast"
        ? !forecastTimeError &&
          (cams.loading ||
            !!cams.pendingAt ||
            cams.surface?.validAt !== timelineTime.at)
        : pm25.loading;
  const timelineError =
    timelineTime.kind === "history"
      ? mapHistory.error
      : timelineTime.kind === "forecast"
        ? forecastTimeError
        : pm25.error;
  const timelineReading =
    historyStation && timelineTime.kind !== "forecast"
      ? (timelineTime.kind === "history"
          ? mapHistory.stations
          : pm25.stations
        ).find((row) => row.id === historyStation.id)
      : null;
  const timelineStation = historyStation
    ? {
        ...historyStation,
        recorded_at: timelineReading?.recorded_at,
        data_status: timelineReading?.data_status,
        pm25:
          timelineTime.kind === "forecast"
            ? cams.surface?.validAt === timelineTime.at
              ? gridValue(cams.surface, historyStation.lat, historyStation.lon)
              : null
            : (timelineReading?.pm25 ?? null),
      }
    : null;
  const closeStationTime = () => {
    setTimelineOpen(false);
    setHistoryStation(null);
    setTimelineTime({ kind: "current" });
    setDataMode("current");
    pauseCams();
  };

  const backToStation = () => {
    const station = pm25.stations.find((row) => row.id === historyStation?.id);
    closeStationTime();
    if (station) selectStation(station);
  };

  const openStationTime = (nextMode: StationTimeMode) => {
    setHistoryStation(
      selectedStation
        ? {
            id: selectedStation.id,
            name:
              selectedStation.name_th ??
              selectedStation.name_en ??
              selectedStation.id,
            lat: selectedStation.lat,
            lon: selectedStation.lon,
          }
        : null,
    );
    const anchor = Math.floor(Date.now() / 3600000) * 3600000;
    setTimelineAnchor(anchor);
    setHistoryAnchor(anchor);
    setTimelineMode(nextMode);
    setTimelineOpen(true);
    selectStationTime(
      nextMode === "history"
        ? { kind: "current" }
        : { kind: "forecast", at: new Date(anchor).toISOString() },
    );
    setSelectedStation(null);
    setSelectedReport(null);
    setSelectedPlace(null);
    setSelectedStackId(null);
  };

  const map = (
    <main className="cp-map" data-mode={mode}>
      {reportLinkError && (
        <div className={noticeStyles.notice} role="alert">
          {reportLinkError}
          <button type="button" onClick={() => window.location.reload()}>
            ลองใหม่
          </button>
        </div>
      )}
      <MapView
        dataMode={mode}
        camsSurface={
          camsEnabled && !(timelineOpen && historyStation) ? cams.surface : null
        }
        camsPreload={
          camsEnabled && !(timelineOpen && historyStation)
            ? cams.preloadSurfaces
            : undefined
        }
        camsPoint={
          camsEnabled && requestStep === "idle"
            ? timelineOpen && historyStation
              ? historyStation
              : camsPoint
            : null
        }
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
        reports={
          selectedReport &&
          !mapReports.some((report) => report.id === selectedReport.id)
            ? [...mapReports, selectedReport]
            : mapReports
        }
        reportStacks={mapStacks}
        reportPin={null}
        measurementRequests={
          requestStep === "idle" && !historyEnabled ? requestRows : []
        }
        selectedRequestId={selectedRequestId}
        requestsNow={requestData.now}
        onSelectRequest={selectRequest}
        savedHelperLocations={savedHelperLocations}
        requestRadiusKm={
          requestStep !== "idle" ? requestRadius : selectedRequest?.radius_km
        }
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
        requestLocation={requestStep !== "idle"}
        onMoveRequestPoint={
          requestStep === "pick"
            ? (lat, lon) => {
                setRequestPoint({
                  id: `point:${lat}:${lon}`,
                  name: "จุดที่เลือกบนแผนที่",
                  address: "",
                  kind: "point",
                  source: "local",
                  lat,
                  lon,
                });
              }
            : undefined
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
          if (requestStep !== "idle") return;
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
        selectedStationId={
          selectedStation?.id ?? (timelineOpen ? historyStation?.id : undefined)
        }
        selectedReportId={selectedReport?.id}
        selectedReportStackId={selectedStack?.id}
        onLocate={(lat, lon, accuracy = 0) => {
          setSelectedRequestId(null);
          setSelectedPlace(null);
          setSelectedStackId(null);
          setSelectedReport(null);
          setLocatedManually({ lat, lon, accuracy });
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
          }
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
      {requestStep !== "search" && (
        <MapChrome
          camsEnabled={camsEnabled}
          onToggleCams={() => {
            setTimelineOpen(false);
            setHistoryStation(null);
            changeCams();
          }}
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
            setRequestStep("idle");
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
            setRequestStep("idle");
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
      )}
      {requestStep === "idle" && viewMode === "list" && (
        <ListView
          stations={mapStations}
          onSelectStation={(station) => {
            selectStation(station);
            setViewMode("map");
          }}
        />
      )}
      {requestStep === "search" ? (
        <RequestPlaceSearch
          stations={serviceAreaStations}
          userLocation={userLocation}
          onSelect={(location) => {
            setRequestPoint(location);
            setRequestStep("pick");
          }}
          onMapSelect={() => setRequestStep("pick")}
          onClose={() => setRequestStep("idle")}
        />
      ) : requestStep !== "idle" ? (
        <MapRequestPanel
          onCreated={(row) => {
            requestData.upsert(row);
            setRequestStep("idle");
            selectRequest(row);
          }}
          point={requestLabel.point}
          resolvingName={requestLabel.loading}
          editing={requestStep === "form"}
          onConfirm={() => setRequestStep("form")}
          onReselect={() => setRequestStep("pick")}
          onSearch={() => setRequestStep("search")}
          onClose={() => setRequestStep("idle")}
        />
      ) : timelineOpen &&
        !selectedStation &&
        !selectedReport &&
        !selectedRequest ? (
        <StationTimelineControls
          key={timelineMode}
          mode={timelineMode}
          time={timelineTime}
          observedAt={mapHistory.targetAt}
          anchor={timelineAnchor}
          futureTimes={cams.times}
          station={timelineStation}
          loading={timelineLoading}
          error={timelineError}
          paused={!active || panelOpen}
          onSelect={selectStationTime}
          onClose={closeStationTime}
          onBack={historyStation ? backToStation : undefined}
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
            setHistoryStation(null);
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
          freshStationCount={pm25.loading ? undefined : pm25.counts.fresh}
          historicalAt={historyEnabled ? mapHistory.targetAt : null}
          onOpenHistory={
            selectedStation || (!historyEnabled && !selectedPlace)
              ? () => openStationTime("history")
              : undefined
          }
          onOpenForecast={
            selectedStation ? () => openStationTime("forecast") : undefined
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
