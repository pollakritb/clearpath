"use client";

import { useState } from "react";

import AppIcon from "@/frontend/components/ui/AppIcon";
import type { FirmsLoadStatus } from "@/frontend/hooks/useFirms";
import type { LocationSuggestion, Station } from "@/frontend/types";
import type { ViewMode } from "@/frontend/types/ui";
import MapLayersPanel from "./MapLayersPanel";
import MapSearchPanel from "./MapSearchPanel";

interface MapChromeProps {
  viewMode: ViewMode;
  stationCount: number;
  sensorCount: number;
  individualReportCount: number;
  fireCount: number;
  fireStatus: FirmsLoadStatus;
  demoMode: boolean;
  stations: Station[];
  bigText: boolean;
  showHeatmap: boolean;
  showStations: boolean;
  showCommunitySensors: boolean;
  showIndividualReports: boolean;
  showFires: boolean;
  onViewModeChange: (mode: ViewMode) => void;
  onToggleBigText: () => void;
  onToggleHeatmap: () => void;
  onToggleStations: () => void;
  onToggleCommunitySensors: () => void;
  onToggleIndividualReports: () => void;
  onToggleFires: () => void;
  onLocationSelect: (location: LocationSuggestion) => void;
  onStationSelect: (station: Station) => void;
}

type OpenPanel = "search" | "layers" | null;

export default function MapChrome({
  viewMode,
  stationCount,
  sensorCount,
  individualReportCount,
  fireCount,
  fireStatus,
  demoMode,
  stations,
  bigText,
  showHeatmap,
  showStations,
  showCommunitySensors,
  showIndividualReports,
  showFires,
  onViewModeChange,
  onToggleBigText,
  onToggleHeatmap,
  onToggleStations,
  onToggleCommunitySensors,
  onToggleIndividualReports,
  onToggleFires,
  onLocationSelect,
  onStationSelect,
}: MapChromeProps) {
  const [openPanel, setOpenPanel] = useState<OpenPanel>(null);
  const closePanel = () => setOpenPanel(null);
  const togglePanel = (panel: Exclude<OpenPanel, null>) =>
    setOpenPanel((current) => (current === panel ? null : panel));

  return (
    <>
      <div className="cp-map-topbar" aria-label="ข้อมูลแผนที่ ClearPath">
        <div aria-hidden className="cp-map-topbar__mark">
          C
        </div>
        <div className="cp-map-topbar__copy">
          <strong>ClearPath</strong>
          <small>คุณภาพอากาศทั่วไทย</small>
        </div>
        <span className="cp-map-topbar__count">
          {stationCount + sensorCount + individualReportCount}{" "}
          <small>จุดข้อมูล</small>
        </span>
        {demoMode && <span className="cp-map-demo-badge">ข้อมูลจำลอง</span>}
      </div>

      <div className="cp-map-actions" aria-label="เครื่องมือแผนที่">
        <MapAction
          icon="search"
          label="ค้นหาสถานีหรือพื้นที่"
          panelId="cp-map-search-panel"
          active={openPanel === "search"}
          onClick={() => togglePanel("search")}
        />
        <MapAction
          icon="layers"
          label="เลือกข้อมูลที่แสดงบนแผนที่"
          panelId="cp-map-layers-panel"
          active={openPanel === "layers"}
          onClick={() => togglePanel("layers")}
        />
      </div>

      {openPanel === "search" && (
        <MapSearchPanel
          stations={stations}
          onClose={closePanel}
          onLocationSelect={onLocationSelect}
          onStationSelect={onStationSelect}
        />
      )}
      {openPanel === "layers" && (
        <MapLayersPanel
          viewMode={viewMode}
          stationCount={stationCount}
          sensorCount={sensorCount}
          individualReportCount={individualReportCount}
          fireCount={fireCount}
          fireStatus={fireStatus}
          bigText={bigText}
          showHeatmap={showHeatmap}
          showStations={showStations}
          showCommunitySensors={showCommunitySensors}
          showIndividualReports={showIndividualReports}
          showFires={showFires}
          onClose={closePanel}
          onViewModeChange={onViewModeChange}
          onToggleBigText={onToggleBigText}
          onToggleHeatmap={onToggleHeatmap}
          onToggleStations={onToggleStations}
          onToggleCommunitySensors={onToggleCommunitySensors}
          onToggleIndividualReports={onToggleIndividualReports}
          onToggleFires={onToggleFires}
        />
      )}
    </>
  );
}

function MapAction({
  icon,
  label,
  panelId,
  active,
  onClick,
}: {
  icon: "search" | "layers";
  label: string;
  panelId: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="cp-map-action cp-focus"
      aria-label={label}
      aria-expanded={active}
      aria-controls={panelId}
      data-active={active}
      onClick={onClick}
    >
      <AppIcon name={icon} size={22} />
    </button>
  );
}
