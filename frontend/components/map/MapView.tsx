"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { Circle, MapContainer, Marker, TileLayer } from "react-leaflet";

import {
  DEFAULT_ZOOM,
  THAILAND_CENTER,
  OSM_ATTRIBUTION,
  OSM_TILE_URL,
} from "@/frontend/lib/constants";
import type {
  CommunityReport,
  CommunityReportStack,
  FirePoint,
  Station,
} from "@/frontend/types";
import type { ViewportBounds } from "@/frontend/types/ui";

import AutoResize from "./AutoResize";
import ClickHandler from "./ClickHandler";
import FireLayer from "./FireLayer";
import IdwSurface from "./IdwSurface";
import MapControls from "./MapControls";
import { CURRENT_LOCATION_ICON, REPORT_PIN_ICON } from "./map-icons";
import ReportMarkers from "./ReportMarkers";
import StationMarkers from "./StationMarkers";
import ViewportController from "./ViewportController";
import ViewportReporter from "./ViewportReporter";

export interface MapViewProps {
  stations: Station[];
  surfaceStations: Station[];
  fires: FirePoint[];
  reports: CommunityReport[];
  reportStacks: CommunityReportStack[];
  reportPin: { lat: number; lon: number } | null;
  userLocation?: { lat: number; lon: number; accuracy: number } | null;
  focusPoint?: { lat: number; lon: number } | null;
  placePoint?: { lat: number; lon: number; radiusKm: number } | null;
  showHeatmap: boolean;
  showStations: boolean;
  showIndividualReports: boolean;
  onMapClick: (lat: number, lon: number) => void;
  onSelectStation: (s: Station) => void;
  onSelectReport: (report: CommunityReport) => void;
  onSelectReportStack: (stack: CommunityReportStack) => void;
  selectedStationId?: string | null;
  selectedReportId?: string | null;
  selectedReportStackId?: string | null;
  onLocate?: (lat: number, lon: number, accuracy?: number) => void;
  onViewportChange?: (bounds: ViewportBounds) => void;
}

export default function MapView({
  stations,
  surfaceStations,
  fires,
  reports,
  reportStacks,
  reportPin,
  userLocation = null,
  focusPoint = null,
  placePoint = null,
  showHeatmap,
  showStations,
  showIndividualReports,
  onMapClick,
  onSelectStation,
  onSelectReport,
  onSelectReportStack,
  selectedStationId = null,
  selectedReportId = null,
  selectedReportStackId = null,
  onLocate,
  onViewportChange,
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
      className="cp-fill-container"
      scrollWheelZoom
    >
      <TileLayer url={OSM_TILE_URL} attribution={OSM_ATTRIBUTION} />

      {placePoint && (
        <>
          <Circle
            center={[placePoint.lat, placePoint.lon]}
            radius={placePoint.radiusKm * 1000}
            pathOptions={{
              color: "#35706c",
              weight: 2,
              dashArray: "7 6",
              fillColor: "#d7ebe8",
              fillOpacity: 0.13,
            }}
          />
          <Marker
            position={[placePoint.lat, placePoint.lon]}
            icon={L.divIcon({
              className: "cp-place-marker",
              html: '<span class="cp-place-marker__symbol" aria-hidden="true">⌖</span>',
              iconSize: [42, 42],
              iconAnchor: [21, 21],
            })}
            title="สถานที่ที่เลือก"
            alt="สถานที่ที่เลือก"
            zIndexOffset={1200}
          />
        </>
      )}

      {showHeatmap && (
        <IdwSurface stations={surfaceStations} min={pmMin} max={pmMax} />
      )}
      {showStations && (
        <StationMarkers
          stations={stations}
          onSelect={onSelectStation}
          selectedId={selectedStationId}
        />
      )}
      {showIndividualReports && (
        <ReportMarkers
          reports={reports}
          stacks={reportStacks}
          onSelect={onSelectReport}
          onSelectStack={onSelectReportStack}
          selectedId={selectedReportId}
          selectedStackId={selectedReportStackId}
        />
      )}
      {fires.length > 0 && <FireLayer fires={fires} />}

      {reportPin && (
        <Marker
          position={[reportPin.lat, reportPin.lon]}
          icon={REPORT_PIN_ICON}
        />
      )}
      {userLocation && (
        <Marker
          position={[userLocation.lat, userLocation.lon]}
          icon={CURRENT_LOCATION_ICON}
          title="ตำแหน่งปัจจุบันของคุณ"
          alt="ตำแหน่งปัจจุบันของคุณ"
          zIndexOffset={1000}
        />
      )}

      <AutoResize />
      <ViewportController target={focusPoint} radiusKm={placePoint?.radiusKm} />
      {onViewportChange && <ViewportReporter onChange={onViewportChange} />}
      <MapControls onLocate={onLocate} hasLocation={Boolean(userLocation)} />
      <ClickHandler onClick={onMapClick} />
    </MapContainer>
  );
}
