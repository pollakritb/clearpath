"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/frontend/components/auth/AuthProvider";
import AQICard from "@/frontend/components/panels/AQICard";
import CommunityPanel from "@/frontend/components/panels/CommunityPanel";
import FireAlertPanel from "@/frontend/components/panels/FireAlertPanel";
import ForecastPanel from "@/frontend/components/panels/ForecastPanel";
import Header from "@/frontend/components/panels/Header";
import LayerToggles from "@/frontend/components/panels/LayerToggles";
import ListView from "@/frontend/components/panels/ListView";
import ModelAccuracy from "@/frontend/components/panels/ModelAccuracy";
import ReportForm from "@/frontend/components/panels/ReportForm";
import { useCommunity } from "@/frontend/hooks/useCommunity";
import { useFirms } from "@/frontend/hooks/useFirms";
import { useForecast } from "@/frontend/hooks/useForecast";
import { useForecastSurface } from "@/frontend/hooks/useForecastSurface";
import { useHistory } from "@/frontend/hooks/useHistory";
import { usePm25 } from "@/frontend/hooks/usePm25";
import { useValidation } from "@/frontend/hooks/useValidation";
import { useWeather } from "@/frontend/hooks/useWeather";
import { T } from "@/frontend/lib/ui";
import { communitySourceKind } from "@/frontend/lib/source-kind";
import type {
  CommunityReport,
  LocationSuggestion,
  Station,
} from "@/frontend/types";
import type { ReportLocation, ViewportBounds } from "@/frontend/types/ui";

import DashboardSidebar from "./DashboardSidebar";
import type { DashboardTab, SheetSnap, ViewMode } from "./dashboard-types";
import { SHEET_Y } from "./dashboard-types";
import MapChrome from "./MapChrome";
import MapStatusCard from "./MapStatusCard";
import MobileAirSummary from "./MobileAirSummary";
import NationalSummary from "./NationalSummary";

const MapView = dynamic(() => import("@/frontend/components/map/MapView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      กำลังโหลดแผนที่…
    </div>
  ),
});

export default function ClearPathApp({
  page,
  stationId,
}: {
  page: DashboardTab;
  stationId?: string;
}) {
  const router = useRouter();
  const auth = useAuth();
  const pm25 = usePm25();
  const weather = useWeather();
  const history = useHistory();
  const validation = useValidation();
  const firms = useFirms();
  const forecast = useForecast();
  const forecastSurface = useForecastSurface();
  const community = useCommunity();

  const [manuallySelectedStation, setSelectedStation] =
    useState<Station | null>(null);
  const [selectedReport, setSelectedReport] = useState<CommunityReport | null>(
    null,
  );
  const [showHistory, setShowHistory] = useState(false);
  const [reportPin, setReportPin] = useState<ReportLocation | null>(null);
  const [bigText, setBigText] = useState(false);
  const [contrast, setContrast] = useState(false);
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showStations, setShowStations] = useState(true);
  const [showCommunitySensors, setShowCommunitySensors] = useState(true);
  const [showIndividualReports, setShowIndividualReports] = useState(true);
  const [showFires, setShowFires] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("map");
  const [mapHorizon, setMapHorizon] = useState<0 | 1 | 3 | 6 | 12 | 24>(0);
  const [snap, setSnap] = useState<SheetSnap>("half");
  const [focusPoint, setFocusPoint] = useState<{
    lat: number;
    lon: number;
  } | null>(null);
  const [mapBounds, setMapBounds] = useState<ViewportBounds | null>(null);

  const loadFires = firms.load;
  useEffect(() => {
    void loadFires(1);
  }, [loadFires]);

  const canModerate = ["moderator", "admin"].includes(auth.role);
  const activeTab = page;
  const routeStation = useMemo(
    () =>
      activeTab === "overview" && stationId
        ? (pm25.stations.find((station) => station.id === stationId) ?? null)
        : null,
    [activeTab, pm25.stations, stationId],
  );
  const selectedStation = manuallySelectedStation ?? routeStation;
  const serviceAreaStations = useMemo(
    () => pm25.stations.filter((station) => station.in_service_area),
    [pm25.stations],
  );
  const communitySourceCounts = useMemo(
    () =>
      community.reports.reduce(
        (counts, report) => {
          counts[communitySourceKind(report)] += 1;
          return counts;
        },
        { sensor: 0, individual: 0 },
      ),
    [community.reports],
  );

  const sectionCopy = {
    map: {
      title: "แผนที่คุณภาพอากาศ",
      description: "ค้นหาสถานีและดูค่าฝุ่นในพื้นที่ใกล้คุณ",
    },
    overview: {
      title: "อากาศวันนี้",
      description: "ค่าปัจจุบัน คำแนะนำ พยากรณ์ และประวัติรายสถานี",
    },
    report: {
      title: "ส่งข้อมูลจากเครื่องวัด",
      description: "ถ่ายภาพสดพร้อม GPS แล้วให้ระบบตรวจหลักฐานอัตโนมัติ",
    },
    community: {
      title: "ชุมชนอากาศสะอาด",
      description:
        "ติดตามประกาศ ขอบคุณผู้แบ่งปันข้อมูล และร่วมกิจกรรมสะสมคะแนน",
    },
  }[activeTab];

  const selectStation = useCallback(
    (station: Station) => {
      setSelectedStation(station);
      setSelectedReport(null);
      setMapHorizon(0);
      setShowHistory(false);
      void weather.load(station.lat, station.lon);
      void forecast.load(station.id, 24);
    },
    [weather, forecast],
  );

  const selectReport = useCallback((report: CommunityReport) => {
    setSelectedReport(report);
    setSelectedStation(null);
    setMapHorizon(0);
  }, []);

  const toggleHistory = useCallback(() => {
    setShowHistory((previous) => {
      const next = !previous;
      if (next && selectedStation) void history.load(selectedStation.id, 24);
      return next;
    });
  }, [selectedStation, history]);

  const locateForReport = useCallback(() => {
    navigator.geolocation?.getCurrentPosition((position) => {
      setReportPin({
        lat: position.coords.latitude,
        lon: position.coords.longitude,
        source: "gps",
        accuracy: position.coords.accuracy,
      });
    });
  }, []);

  const weatherLoad = weather.load;
  const forecastLoad = forecast.load;
  useEffect(() => {
    if (!routeStation) return;
    void weatherLoad(routeStation.lat, routeStation.lon);
    void forecastLoad(routeStation.id, 24);
  }, [forecastLoad, routeStation, weatherLoad]);

  const currentSurfaceStations = useMemo<Station[]>(() => {
    const gapReports = community.mapPoints.map(
      (point) =>
        ({
          id: point.id,
          name_th: "รายงานชุมชนที่ผ่านเกณฑ์",
          name_en: "Verified community gap-fill",
          lat: point.lat,
          lon: point.lon,
          province: null,
          pm25: point.pm25,
          aqi: null,
          color: null,
          level: null,
          recorded_at: null,
          data_status: "fresh" as const,
          age_minutes: null,
          eligible_for_surface: true,
          in_service_area: true,
        }) satisfies Station,
    );
    return [
      ...pm25.stations.filter((station) => station.eligible_for_surface),
      ...gapReports,
    ];
  }, [pm25.stations, community.mapPoints]);

  const forecastSurfaceLoad = forecastSurface.load;
  const forecastSurfaceClear = forecastSurface.clear;
  useEffect(() => {
    if (activeTab !== "map" || mapHorizon === 0) {
      forecastSurfaceClear();
      return;
    }
    if (mapBounds) void forecastSurfaceLoad(mapHorizon, mapBounds);
  }, [
    activeTab,
    forecastSurfaceClear,
    forecastSurfaceLoad,
    mapBounds,
    mapHorizon,
  ]);

  const forecastSurfaceStations = useMemo<Station[]>(() => {
    const surface = forecastSurface.data;
    if (!surface) return [];
    return surface.cells.flatMap((cell, index) =>
      cell.pm25 == null
        ? []
        : [
            {
              id: `forecast-${mapHorizon}-${index}`,
              name_th: `พื้นผิวพยากรณ์ ${mapHorizon} ชั่วโมง`,
              name_en: "Forecast surface",
              lat: cell.lat,
              lon: cell.lon,
              province: null,
              pm25: cell.pm25,
              aqi: null,
              color: null,
              level: null,
              recorded_at: surface.generated_at,
              data_status: cell.coverage === "covered" ? "fresh" : "delayed",
              age_minutes: null,
              eligible_for_surface: true,
              in_service_area: true,
            } satisfies Station,
          ],
    );
  }, [forecastSurface.data, mapHorizon]);
  const surfaceStations =
    mapHorizon === 0 ? currentSurfaceStations : forecastSurfaceStations;

  const layerItems = [
    {
      key: "heat",
      label: "พื้นผิว PM2.5 (IDW)",
      dot: "linear-gradient(90deg,#3b82f6,#22c55e,#eab308,#f97316,#ef4444)",
      on: showHeatmap,
      onToggle: () => setShowHeatmap((value) => !value),
    },
    {
      key: "stations",
      label: "สถานี Air4Thai",
      dot: T.teal,
      on: showStations,
      onToggle: () => setShowStations((value) => !value),
    },
    {
      key: "community-sensors",
      label: `สถานีชุมชน · ${communitySourceCounts.sensor}`,
      dot: "#0b8f83",
      on: showCommunitySensors,
      onToggle: () => setShowCommunitySensors((value) => !value),
    },
    {
      key: "individual-reports",
      label: `รายงานจากบุคคล · ${communitySourceCounts.individual}`,
      dot: "#e77b28",
      on: showIndividualReports,
      onToggle: () => setShowIndividualReports((value) => !value),
    },
    {
      key: "fires",
      label: `จุดความร้อน FIRMS${firms.loaded ? ` · ${firms.fires.length}` : ""}`,
      dot: "#ff5722",
      on: showFires,
      onToggle: () => setShowFires((value) => !value),
      note: firms.error,
    },
  ];

  const rootStyle = {
    fontSize: bigText ? "18px" : "15px",
    lineHeight: 1.45,
    fontFamily: "var(--font-noto-thai), system-ui, sans-serif",
    "--cp-aside-w": bigText ? "460px" : "420px",
    "--cp-sheet-y": SHEET_Y[snap],
  } as React.CSSProperties;

  return (
    <div
      className="cp-app"
      data-contrast={contrast}
      data-tab={activeTab}
      data-sheet-snap={snap}
      style={rootStyle}
    >
      <DashboardSidebar
        tab={activeTab}
        snap={snap}
        onSnapChange={setSnap}
        showAdmin={canModerate}
        header={
          <Header
            icon={
              activeTab === "map"
                ? "map"
                : activeTab === "overview"
                  ? "activity"
                  : activeTab === "report"
                    ? "camera"
                    : "community"
            }
            theme={activeTab}
            title={sectionCopy.title}
            description={sectionCopy.description}
            stationCount={serviceAreaStations.length}
            updatedAt={pm25.updatedAt}
            loading={pm25.loading}
            delayedCount={pm25.counts.delayed}
            expiredCount={pm25.counts.expired}
            error={pm25.error}
            bigText={bigText}
            contrast={contrast}
            onToggleBigText={() => setBigText((value) => !value)}
            onToggleContrast={() => setContrast((value) => !value)}
          />
        }
      >
        {activeTab === "overview" && (
          <div className="cp-overview-stack">
            <MobileAirSummary
              stations={serviceAreaStations}
              updatedAt={pm25.updatedAt}
              loading={pm25.loading}
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
              error={firms.error}
              onShowLayer={() => setShowFires(true)}
            />
            <ForecastPanel
              station={selectedStation}
              data={forecast.data}
              loading={forecast.loading}
              error={forecast.error}
            />
            <div className="cp-overview-tools cp-overview-tools--desktop">
              <LayerToggles items={layerItems} />
              <ModelAccuracy
                data={validation.data}
                loading={validation.loading}
                error={validation.error}
                onLoad={validation.load}
              />
            </div>
            <details className="cp-overview-tools cp-overview-tools--mobile">
              <summary>เครื่องมือแผนที่และข้อมูลเพิ่มเติม</summary>
              <div>
                <LayerToggles items={layerItems} />
                <ModelAccuracy
                  data={validation.data}
                  loading={validation.loading}
                  error={validation.error}
                  onLoad={validation.load}
                />
              </div>
            </details>
          </div>
        )}

        {activeTab === "report" && (
          <ReportForm
            location={reportPin}
            onRequestLocation={locateForReport}
            onSubmitted={community.refresh}
          />
        )}
        {activeTab === "community" && (
          <CommunityPanel
            announcements={community.announcements}
            activities={community.activities}
            leaders={community.leaders}
            onRefresh={community.refresh}
            showAdmin={canModerate}
          />
        )}
        {community.error && (
          <p
            role="alert"
            style={{ fontSize: ".7em", color: "#c2433a", marginTop: "1em" }}
          >
            ชุมชน: {community.error}
          </p>
        )}
      </DashboardSidebar>

      <main className="cp-map">
        <MapView
          stations={serviceAreaStations}
          surfaceStations={surfaceStations}
          fires={showFires ? firms.fires : []}
          reports={community.reports}
          reportPin={reportPin}
          focusPoint={focusPoint}
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
          stations={serviceAreaStations}
          bigText={bigText}
          showHeatmap={showHeatmap}
          showStations={showStations}
          showCommunitySensors={showCommunitySensors}
          showIndividualReports={showIndividualReports}
          onViewModeChange={setViewMode}
          onToggleBigText={() => setBigText((value) => !value)}
          onToggleHeatmap={() => setShowHeatmap((value) => !value)}
          onToggleStations={() => setShowStations((value) => !value)}
          onToggleCommunitySensors={() =>
            setShowCommunitySensors((value) => !value)
          }
          onToggleIndividualReports={() =>
            setShowIndividualReports((value) => !value)
          }
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
        {activeTab === "map" && (
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
        )}
      </main>
    </div>
  );
}
