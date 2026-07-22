/** UI-only types. These are not part of the backend API contract barrel. */

export interface ReportLocation {
  lat: number;
  lon: number;
  source: "gps" | "map";
  accuracy?: number;
}

export interface ReportDetails {
  displayName: string;
  deviceModel: string;
  deviceCalibrated: boolean;
  calibratedAt: string;
  nearEmissionSource: boolean;
  measurementNote: string;
  measurementStable: boolean;
  averagingPeriod: "instant" | "1_minute" | "5_minutes";
  measurementDurationSeconds: number;
}

export const EMPTY_REPORT_DETAILS: ReportDetails = {
  displayName: "",
  deviceModel: "",
  deviceCalibrated: false,
  calibratedAt: "",
  nearEmissionSource: false,
  measurementNote: "",
  measurementStable: false,
  averagingPeriod: "instant",
  measurementDurationSeconds: 60,
};

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

export interface ForecastModelStatus {
  horizon_hours: number;
  active: boolean;
  version: string | null;
  metrics: Record<string, number | string | boolean | null> | null;
  reason: string | null;
}

export interface AdminSyncRunsResponse {
  runs: AdminSyncRun[];
  count: number;
}

export interface ForecastModelStatusesResponse {
  models: ForecastModelStatus[];
  count: number;
}

export interface NotificationOutboxSummary {
  pending: number;
  processing: number;
  sent: number;
  failed: number;
  oldest_waiting_at: string | null;
  latest_error: string | null;
}
