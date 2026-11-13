"use client";
import BrandMark from "@/frontend/components/ui/BrandMark";
import AccountMenu from "@/frontend/components/auth/AccountMenu";

import { useEffect, useState } from "react";

import AppIcon from "@/frontend/components/ui/AppIcon";
import type { FirmsLoadStatus } from "@/frontend/hooks/useFirms";
import type { LocationSuggestion, Station } from "@/frontend/types";
import type { ViewMode } from "@/frontend/types/ui";
import MapLayersPanel from "./MapLayersPanel";
import MapSearchPanel from "./MapSearchPanel";

interface MapChromeProps {
  camsEnabled?: boolean;
  onToggleCams?: () => void;
  onPanelChange?: (open: boolean) => void;
  viewMode: ViewMode;
  stationCount: number;
  individualReportCount: number;
  fireCount: number;
  fireStatus: FirmsLoadStatus;
  demoMode: boolean;
  stations: Station[];
  showHeatmap: boolean;
  heatmapDistanceKm: number | null;
  heatmapStatus:
    | "ready"
    | "no_data"
    | "no_location"
    | "location_denied"
    | "location_unavailable";
  showStations: boolean;
  showIndividualReports: boolean;
  showFires: boolean;
  onViewModeChange: (mode: ViewMode) => void;
  onToggleHeatmap: () => void;
  onToggleStations: () => void;
  onToggleIndividualReports: () => void;
  onToggleFires: () => void;
  onLocationSelect: (location: LocationSuggestion) => void;
  onStationSelect: (station: Station) => void;
}

type OpenPanel = "search" | "layers" | null;

export default function MapChrome({
  camsEnabled = false,
  onToggleCams,
  onPanelChange,
  viewMode,
  stationCount,
  individualReportCount,
  fireCount,
  fireStatus,
  demoMode,
  stations,
  showHeatmap,
  heatmapDistanceKm,
  heatmapStatus,
  showStations,
  showIndividualReports,
  showFires,
  onViewModeChange,
  onToggleHeatmap,
  onToggleStations,
  onToggleIndividualReports,
  onToggleFires,
  onLocationSelect,
  onStationSelect,
}: MapChromeProps) {
  const [openPanel, setOpenPanel] = useState<OpenPanel>(null);
  useEffect(() => {
    onPanelChange?.(openPanel !== null);
    return () => onPanelChange?.(false);
  }, [openPanel, onPanelChange]);
  const closePanel = () => setOpenPanel(null);
  const togglePanel = (panel: Exclude<OpenPanel, null>) =>
    setOpenPanel((current) => (current === panel ? null : panel));

  return (
    <>
      <div className="cp-map-topbar" aria-label="ค้นหาและบัญชี ClearPath">
        <button
          type="button"
          className="cp-map-search-trigger cp-focus"
          aria-label="ค้นหาสถานที่หรือสถานี"
          aria-expanded={openPanel === "search"}
          aria-controls="cp-map-search-panel"
          onClick={() => togglePanel("search")}
        >
          <span aria-hidden="true" className="cp-map-topbar__mark">
            <BrandMark />
          </span>
          <span className="cp-map-search-trigger__copy">
            <span>ค้นหาสถานที่หรือสถานี</span>
            {demoMode && <small>ข้อมูลจำลอง</small>}
          </span>
        </button>
        <AccountMenu />
      </div>

      <div className="cp-map-actions" aria-label="เครื่องมือแผนที่">
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
          forecastMode={camsEnabled}
          stations={stations}
          onClose={closePanel}
          onLocationSelect={onLocationSelect}
          onStationSelect={onStationSelect}
        />
      )}
      {openPanel === "layers" && (
        <MapLayersPanel
          camsEnabled={camsEnabled}
          onToggleCams={onToggleCams}
          viewMode={viewMode}
          stationCount={stationCount}
          individualReportCount={individualReportCount}
          fireCount={fireCount}
          fireStatus={fireStatus}
          showHeatmap={showHeatmap}
          heatmapDistanceKm={heatmapDistanceKm}
          heatmapStatus={heatmapStatus}
          showStations={showStations}
          showIndividualReports={showIndividualReports}
          showFires={showFires}
          onClose={closePanel}
          onViewModeChange={onViewModeChange}
          onToggleHeatmap={onToggleHeatmap}
          onToggleStations={onToggleStations}
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
