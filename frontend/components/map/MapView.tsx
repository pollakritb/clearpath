"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { CircleMarker, MapContainer, TileLayer } from "react-leaflet";

import {
  DEFAULT_ZOOM,
  MAP_BOUNDS,
  THAILAND_CENTER,
  OSM_ATTRIBUTION,
  OSM_TILE_URL,
} from "@/frontend/lib/constants";
import type { HeatmapPoint } from "@/frontend/lib/nearest-surface";
import type {
  CommunityReport,
  CommunityReportStack,
  FirePoint,
  MeasurementRequestView,
  Station,
} from "@/frontend/types";
import type { MapFocusPoint, ViewportBounds } from "@/frontend/types/ui";

import PriorityMarker, { MarkerPriorityProvider } from "./PriorityMarker";
import CamsCanvasLayer from "./CamsCanvasLayer";
import PlaceSearchRadius from "./PlaceSearchRadius";
import RequestLocationMarker from "./RequestLocationMarker";
import type { GridSurface } from "@/frontend/types/ui";
import { AutoResize } from "./MapBehaviors";
import { ClickHandler } from "./MapBehaviors";
import FireLayer from "./FireLayer";
import NearestHeatmap from "./NearestHeatmap";
import MapControls from "./MapControls";
import { CURRENT_LOCATION_ICON, REPORT_PIN_ICON } from "./map-icons";
import ReportMarkers from "./ReportMarkers";
import StationMarkers from "./StationMarkers";
import ForecastStationMarker from "./ForecastStationMarker";
import type { ForecastStationPoint } from "@/frontend/types/ui";
import { ViewportController } from "./MapBehaviors";
import { ViewportReporter } from "./MapBehaviors";
import RequestMarkers from "./RequestMarkers";

export interface MapViewProps {
  toolsOpen?: boolean;
  dataMode?: string;
  camsSurface?: GridSurface | null;
  camsPreload?: GridSurface[];
  camsPoint?: { lat: number; lon: number } | null;
  forecastStation?: ForecastStationPoint | null;
  stations: Station[];
  heatmapPoint: HeatmapPoint | null;
  fires: FirePoint[];
  reports: CommunityReport[];
  reportStacks: CommunityReportStack[];
  reportPin: { lat: number; lon: number } | null;
  onSelectFire?: () => void;
  measurementRequests?: MeasurementRequestView[];
  selectedRequestId?: string | null;
  requestsNow?: number;
  requestRadiusKm?: number;
  onSelectRequest?: (request: MeasurementRequestView) => void;
  userLocation?: { lat: number; lon: number; accuracy: number } | null;
  locationUnavailable?: boolean;
  focusPoint?: MapFocusPoint | null;
  placePoint?: { lat: number; lon: number; radiusKm: number } | null;
  requestLocation?: boolean;
  onMoveRequestPoint?: (lat: number, lon: number) => void;
  resetViewSignal?: number;
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
  onResetView?: () => void;
  onViewportChange?: (bounds: ViewportBounds) => void;
}

export default function MapView({
  toolsOpen = false,
  dataMode = "current",
  camsSurface = null,
  camsPreload,
  camsPoint = null,
  forecastStation = null,
  stations,
  heatmapPoint,
  fires,
  reports,
  reportStacks,
  reportPin,
  onSelectFire,
  measurementRequests = [],
  selectedRequestId = null,
  requestsNow = 0,
  requestRadiusKm,
  onSelectRequest,
  userLocation = null,
  locationUnavailable = false,
  focusPoint = null,
  placePoint = null,
  requestLocation = false,
  onMoveRequestPoint,
  resetViewSignal = 0,
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
  onResetView,
  onViewportChange,
}: MapViewProps) {
  return (
    <MapContainer
      center={THAILAND_CENTER}
      zoom={DEFAULT_ZOOM}
      minZoom={DEFAULT_ZOOM - 1}
      maxBounds={MAP_BOUNDS}
      maxBoundsViscosity={1}
      zoomControl={false}
      className="cp-fill-container"
      scrollWheelZoom
    >
      <MarkerPriorityProvider toolsOpen={toolsOpen}>
        <TileLayer
          url={OSM_TILE_URL}
          attribution={OSM_ATTRIBUTION}
          noWrap
          crossOrigin="anonymous"
        />

        <CamsCanvasLayer surface={camsSurface} preload={camsPreload} />
        {forecastStation && <ForecastStationMarker point={forecastStation} />}
        {camsPoint && !forecastStation && (
          <CircleMarker
            center={[camsPoint.lat, camsPoint.lon]}
            radius={6}
            pathOptions={{
              color: "#195d58",
              fillColor: "white",
              fillOpacity: 1,
              weight: 3,
              interactive: false,
            }}
          />
        )}
        {requestLocation && onMoveRequestPoint && (
          <RequestLocationMarker
            position={placePoint}
            radiusKm={requestRadiusKm ?? 2}
            onMove={onMoveRequestPoint}
          />
        )}
        {placePoint && !(requestLocation && onMoveRequestPoint) && (
          <>
            <PlaceSearchRadius
              lat={placePoint.lat}
              lon={placePoint.lon}
              radiusKm={placePoint.radiusKm}
            />
            {requestLocation ? (
              <RequestLocationMarker position={placePoint} />
            ) : (
              <PriorityMarker
                priorityId="place-point"
                position={[placePoint.lat, placePoint.lon]}
                icon={L.divIcon({
                  className: "cp-place-marker",
                  html: '<span class="cp-place-marker__symbol" aria-hidden="true"><svg viewBox="0 0 48 56" width="48" height="56" fill="none"><path d="M24 2C11.85 2 3 11.15 3 22.75c0 15.5 21 30.5 21 30.5s21-15 21-30.5C45 11.15 36.15 2 24 2Z" fill="#195D58" stroke="white" stroke-width="3"/><circle cx="24" cy="23" r="8" fill="white"/><circle cx="24" cy="23" r="3.5" fill="#195D58"/></svg></span>',
                  iconSize: [48, 56],
                  iconAnchor: [24, 53],
                })}
                title="สถานที่ที่เลือก"
                alt="สถานที่ที่เลือก"
                zIndexOffset={1200}
              />
            )}
          </>
        )}

        {showHeatmap && heatmapPoint && <NearestHeatmap point={heatmapPoint} />}
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
        {fires.length > 0 && (
          <FireLayer fires={fires} onSelect={onSelectFire} />
        )}
        <RequestMarkers
          requests={measurementRequests}
          selectedId={selectedRequestId}
          now={requestsNow}
          onSelect={onSelectRequest}
        />

        {reportPin && (
          <PriorityMarker
            priorityId="report-pin"
            position={[reportPin.lat, reportPin.lon]}
            icon={REPORT_PIN_ICON}
          />
        )}
        {userLocation && (
          <PriorityMarker
            priorityId="current-location"
            position={[userLocation.lat, userLocation.lon]}
            icon={CURRENT_LOCATION_ICON}
            title="ตำแหน่งปัจจุบันของคุณ"
            alt="ตำแหน่งปัจจุบันของคุณ"
            zIndexOffset={1000}
          />
        )}

        <AutoResize />
        <ViewportController
          dataMode={dataMode}
          target={requestLocation && onMoveRequestPoint ? null : focusPoint}
          radiusKm={placePoint?.radiusKm ?? requestRadiusKm}
          resetViewSignal={resetViewSignal}
        />
        {onViewportChange && <ViewportReporter onChange={onViewportChange} />}
        <MapControls
          onLocate={onLocate}
          onResetView={onResetView}
          hasLocation={Boolean(userLocation)}
          locationUnavailable={locationUnavailable}
        />
        <ClickHandler onClick={onMapClick} />
      </MarkerPriorityProvider>
    </MapContainer>
  );
}
