"use client";

import "leaflet/dist/leaflet.css";
import { MapContainer, Marker, TileLayer } from "react-leaflet";

import {
  DEFAULT_ZOOM,
  OSM_ATTRIBUTION,
  OSM_TILE_URL,
  THAILAND_CENTER,
} from "@/frontend/lib/constants";
import type { CommunityReport, FirePoint, Station } from "@/frontend/types";

import AutoResize from "./AutoResize";
import ClickHandler from "./ClickHandler";
import FireLayer from "./FireLayer";
import IdwSurface from "./IdwSurface";
import MapControls from "./MapControls";
import { REPORT_PIN_ICON } from "./map-icons";
import ReportMarkers from "./ReportMarkers";
import StationMarkers from "./StationMarkers";
import ViewportController from "./ViewportController";

export interface MapViewProps {
  stations: Station[];
  surfaceStations: Station[];
  fires: FirePoint[];
  reports: CommunityReport[];
  reportPin: { lat: number; lon: number } | null;
  focusPoint?: { lat: number; lon: number } | null;
  showHeatmap: boolean;
  showStations: boolean;
  showCommunity: boolean;
  onMapClick: (lat: number, lon: number) => void;
  onSelectStation: (s: Station) => void;
  onLocate?: (lat: number, lon: number, accuracy?: number) => void;
}

export default function MapView({
  stations,
  surfaceStations,
  fires,
  reports,
  reportPin,
  focusPoint = null,
  showHeatmap,
  showStations,
  showCommunity,
  onMapClick,
  onSelectStation,
  onLocate,
}: MapViewProps) {
  const pmVals = surfaceStations
    .filter((s) => s.pm25 != null)
    .map((s) => s.pm25 as number);
  const pmMin = pmVals.length ? Math.min(...pmVals) : 0;
  const pmMax = pmVals.length ? Math.max(...pmVals) : 50;

  return (
    <MapContainer
      center={THAILAND_CENTER}
      zoom={DEFAULT_ZOOM}
      zoomControl={false}
      className="h-full w-full"
      scrollWheelZoom
    >
      <TileLayer url={OSM_TILE_URL} attribution={OSM_ATTRIBUTION} />

      {showHeatmap && (
        <IdwSurface stations={surfaceStations} min={pmMin} max={pmMax} />
      )}
      {showStations && (
        <StationMarkers stations={stations} onSelect={onSelectStation} />
      )}
      {showCommunity && <ReportMarkers reports={reports} />}
      {fires.length > 0 && <FireLayer fires={fires} />}

      {reportPin && (
        <Marker
          position={[reportPin.lat, reportPin.lon]}
          icon={REPORT_PIN_ICON}
        />
      )}

      <AutoResize />
      <ViewportController target={focusPoint} />
      <MapControls onLocate={onLocate} />
      <ClickHandler onClick={onMapClick} />
    </MapContainer>
  );
}
