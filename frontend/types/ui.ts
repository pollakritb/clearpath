/** UI-only types. These are not part of the backend API contract barrel. */

export interface ReportLocation {
  lat: number;
  lon: number;
  source: "gps" | "map";
  accuracy?: number;
}

export interface AdminSyncRun {
  id: string;
  source: string;
  status: "running" | "success" | "failed" | string;
  started_at: string;
  completed_at?: string | null;
  source_recorded_at?: string | null;
  fetched_count?: number | null;
  station_count?: number | null;
  reading_count?: number | null;
  error_message?: string | null;
}

export interface AdminSyncRunsResponse {
  runs: AdminSyncRun[];
  count: number;
}

export interface DataHealthResponse {
  status: "healthy" | "degraded" | "critical";
  observed_at: string;
  station_count: number;
  fresh_station_count: number;
  delayed_station_count: number;
  expired_station_count: number;
  stale_station_ratio: number;
  latest_recorded_at: string | null;
  latest_sync_status: string | null;
  latest_sync_started_at: string | null;
  latest_sync_completed_at: string | null;
  latest_sync_duration_ms: number | null;
  latest_primary_sync_at: string | null;
  latest_primary_sync_status: string | null;
  latest_backup_sync_at: string | null;
  latest_backup_sync_status: string | null;
  primary_sync_missed: boolean;
  consecutive_sync_failures: number;
  upstream_failure: boolean;
  alert_codes: string[];
}

export interface NotificationOutboxSummary {
  pending: number;
  processing: number;
  sent: number;
  failed: number;
  dead: number;
  oldest_waiting_at: string | null;
  latest_error: string | null;
}

export interface ViewportBounds {
  min_lat: number;
  max_lat: number;
  min_lon: number;
  max_lon: number;
}

export type DashboardTab =
  "map" | "overview" | "report" | "community" | "settings";
export type SheetSnap = "peek" | "half" | "full";
export type ViewMode = "map" | "list";

export interface DataIssueRow {
  id: string;
  category: "station" | "forecast" | "map" | "community" | "other";
  reference_id: string | null;
  message: string;
  status: "new" | "reviewing" | "resolved" | "dismissed";
  created_at: string;
  updated_at: string;
}

export interface DataIssuesResponse {
  issues: DataIssueRow[];
  count: number;
}

export interface AuditLogRow {
  id: number;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

export interface AuditLogsResponse {
  next_cursor?: string | null;
  logs: AuditLogRow[];
  count: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

/** Client-rendered CAMS frame; never part of the public API contract barrel. */
export interface GridSurface {
  latitudes: number[];
  longitudes: number[];
  values: (number | null)[];
  validAt: string;
  generationId: string;
}
export type MapDataMode = "current" | "history" | "cams";

/** Explicit pin selections are repeatable and keep their pin above the detail card. */
export interface MapFocusPoint {
  lat: number;
  lon: number;
  pin?: boolean;
  token?: number;
}

export interface SearchHistoryEntry {
  key: string;
  kind: "place" | "station";
  location: import("./locations").LocationSuggestion;
  stationId?: string;
  selectedAt: number;
}

/** CAMS forecast at the selected station coordinate; not an observation. */
export interface ForecastStationPoint {
  id: string;
  name: string;
  lat: number;
  lon: number;
  pm25: number | null;
  validAt: string;
  loading: boolean;
  error: string | null;
}
