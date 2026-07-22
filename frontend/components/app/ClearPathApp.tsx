"use client";

import dynamic from "next/dynamic";
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
import { useHistory } from "@/frontend/hooks/useHistory";
import { usePm25 } from "@/frontend/hooks/usePm25";
import { useValidation } from "@/frontend/hooks/useValidation";
import { useWeather } from "@/frontend/hooks/useWeather";
import { T } from "@/frontend/lib/ui";
import type { LocationSuggestion, Station } from "@/frontend/types";
import type { ReportLocation } from "@/frontend/types/ui";

import DashboardSidebar from "./DashboardSidebar";
import type { DashboardTab, SheetSnap, ViewMode } from "./dashboard-types";
import { SHEET_Y } from "./dashboard-types";
import MapChrome from "./MapChrome";
import NationalSummary from "./NationalSummary";

const MapView = dynamic(() => import("@/frontend/components/map/MapView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      กำลังโหลดแผนที่…
    </div>
  ),
});

export default function ClearPathApp() {
  const auth = useAuth();
  const pm25 = usePm25();
  const weather = useWeather();
  const history = useHistory();
  const validation = useValidation();
  const firms = useFirms();
  const forecast = useForecast();
  const community = useCommunity();

  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [reportPin, setReportPin] = useState<ReportLocation | null>(null);
  const [tab, setTab] = useState<DashboardTab>("overview");
  const [bigText, setBigText] = useState(false);
  const [contrast, setContrast] = useState(false);
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showStations, setShowStations] = useState(true);
  const [showCommunity, setShowCommunity] = useState(true);
  const [showFires, setShowFires] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("map");
  const [snap, setSnap] = useState<SheetSnap>("half");
  const [focusPoint, setFocusPoint] = useState<{
    lat: number;
    lon: number;
  } | null>(null);

  const loadFires = firms.load;
  useEffect(() => {
    void loadFires(1);
  }, [loadFires]);

  const canModerate = ["moderator", "admin"].includes(auth.role);
  const activeTab = tab;

  const sectionCopy = {
    overview: {
      title: "สถานการณ์ฝุ่นวันนี้",
      description:
        "เลือกจุดบนแผนที่เพื่อดูค่าปัจจุบัน แนวโน้ม และที่มาของข้อมูล",
    },
    report: {
      title: "ส่งข้อมูลจากเครื่องวัด",
      description: "ถ่ายภาพสดผ่านระบบ พร้อม GPS เพื่อส่งให้ผู้ดูแลตรวจสอบ",
    },
    community: {
      title: "ชุมชนอากาศสะอาด",
      description:
        "ติดตามประกาศ ช่วยยืนยันข้อมูลใกล้ตัว และร่วมกิจกรรมสะสมคะแนน",
    },
  }[activeTab];

  const selectStation = useCallback(
    (station: Station) => {
      setSelectedStation(station);
      setShowHistory(false);
      setTab("overview");
      setSnap("full");
      void weather.load(station.lat, station.lon);
      void forecast.load(station.id, 12);
    },
    [weather, forecast],
  );

  const toggleHistory = useCallback(() => {
    setShowHistory((previous) => {
      const next = !previous;
      if (next && selectedStation) void history.load(selectedStation.id, 24);
      return next;
    });
  }, [selectedStation, history]);

  const openReport = useCallback((location: ReportLocation) => {
    setReportPin(location);
    setTab("report");
    setSnap("full");
  }, []);

  const locateForReport = useCallback(() => {
    navigator.geolocation?.getCurrentPosition((position) => {
      openReport({
        lat: position.coords.latitude,
        lon: position.coords.longitude,
        source: "gps",
        accuracy: position.coords.accuracy,
      });
    });
  }, [openReport]);

  const surfaceStations = useMemo<Station[]>(() => {
    const gapReports = community.mapPoints.map((point) => ({
      id: point.id,
      name_th: "รายงานชุมชนที่ผ่านเกณฑ์",
      name_en: "Verified community gap-fill",
      lat: point.lat,
      lon: point.lon,
      province: "นครปฐม",
      pm25: point.pm25,
      aqi: null,
      color: null,
      level: null,
      recorded_at: null,
      data_status: "fresh" as const,
      age_minutes: null,
      eligible_for_surface: true,
    }));
    return [
      ...pm25.stations.filter((station) => station.eligible_for_surface),
      ...gapReports,
    ];
  }, [pm25.stations, community.mapPoints]);

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
      key: "community",
      label: `รายงานชุมชน · ${community.reports.length}`,
      dot: "#7c3aed",
      on: showCommunity,
      onToggle: () => setShowCommunity((value) => !value),
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
    <div className="cp-app" data-contrast={contrast} style={rootStyle}>
      <DashboardSidebar
        tab={activeTab}
        snap={snap}
        onTabChange={setTab}
        onSnapChange={setSnap}
        showAdmin={canModerate}
        header={
          <Header
            title={sectionCopy.title}
            description={sectionCopy.description}
            stationCount={pm25.stations.length}
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
          <div style={{ display: "flex", flexDirection: "column", gap: "1em" }}>
            <NationalSummary stations={pm25.stations} />
            <AQICard
              station={selectedStation}
              weather={weather.data}
              weatherLoading={weather.loading}
              showHistory={showHistory}
              onToggleHistory={toggleHistory}
              historyPoints={history.points}
              historyLoading={history.loading}
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
            <LayerToggles items={layerItems} />
            <ModelAccuracy
              data={validation.data}
              loading={validation.loading}
              error={validation.error}
              onLoad={validation.load}
            />
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
          stations={pm25.stations}
          surfaceStations={surfaceStations}
          fires={showFires ? firms.fires : []}
          reports={community.reports}
          reportPin={reportPin}
          focusPoint={focusPoint}
          showHeatmap={showHeatmap}
          showStations={showStations}
          showCommunity={showCommunity}
          onMapClick={(lat, lon) => openReport({ lat, lon, source: "map" })}
          onSelectStation={selectStation}
          onLocate={(lat, lon, accuracy) =>
            openReport({ lat, lon, source: "gps", accuracy })
          }
        />
        <MapChrome
          viewMode={viewMode}
          stationCount={pm25.stations.length}
          bigText={bigText}
          onViewModeChange={setViewMode}
          onToggleBigText={() => setBigText((value) => !value)}
          onLocationSelect={(location: LocationSuggestion) => {
            setFocusPoint({ lat: location.lat, lon: location.lon });
            setViewMode("map");
          }}
        />
        {viewMode === "list" && (
          <ListView stations={pm25.stations} onSelectStation={selectStation} />
        )}
      </main>
    </div>
  );
}
