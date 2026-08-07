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

export interface ForecastDataQualityRow {
  quality_date: string;
  source_name: string;
  station_id: string;
  expected_hours: number;
  observed_hours: number;
  missing_hours: number;
  duplicate_hours: number;
  invalid_rows: number;
  newest_source_at: string | null;
  reconciled_at: string;
}

export interface ForecastDataQualityResponse {
  rows: ForecastDataQualityRow[];
  count: number;
  days: number;
}

export interface ForecastProviderRun {
  id: string;
  provider: string;
  status: "running" | "success" | "partial" | "failed";
  station_count: number;
  snapshot_count: number;
  error_count: number;
  started_at: string;
  completed_at: string | null;
}

export interface ForecastProviderHealthResponse {
  providers: ForecastProviderRun[];
  consensus: {
    station_count: number;
    multi_provider_count: number;
    community_influenced_count: number;
    agreement_counts: { high: number; medium: number; low: number };
  };
  feature_flags: Record<string, boolean>;
}

export interface ForecastEvaluationRow {
  evaluation_date: string;
  environment: string;
  horizon_hours: number;
  method: string;
  station_id: string;
  district: string;
  rows: number;
  mae: number | null;
  rmse: number | null;
  false_safe_rate: number | null;
  interval_coverage: number | null;
  fallback_rate: number | null;
  p95_latency_ms: number | null;
  computed_at: string;
}

export interface ForecastEvaluationResponse {
  rows: ForecastEvaluationRow[];
  count: number;
  days: number;
}

export type FalseSafeDisposition =
  | "expected_edge_case"
  | "source_data_issue"
  | "model_issue"
  | "safety_incident";

export interface ForecastFalseSafeReview {
  disposition: FalseSafeDisposition;
  note: string;
  reviewed_at: string;
}

export interface ForecastFalseSafeCase {
  run_id: string;
  horizon_hours: number;
  variant: "served" | "shadow";
  forecast_at: string;
  pm25: number;
  lower: number;
  upper: number;
  method: string;
  model_version: string | null;
  observed_pm25: number;
  observed_at: string;
  absolute_error: number;
  signed_error: number;
  settled_at: string;
  forecast_runs: {
    station_id: string;
    district: string | null;
    environment: string;
  };
  forecast_false_safe_reviews: ForecastFalseSafeReview[];
}

export interface ForecastFalseSafeCasesResponse {
  cases: ForecastFalseSafeCase[];
  count: number;
  days: number;
}

export interface ForecastFalseSafeReviewRequest {
  disposition: FalseSafeDisposition;
  note: string;
}

export interface ForecastReleaseDecision {
  id: string;
  registry_id: string | null;
  decision:
    "approve_shadow" | "approve_canary" | "promote" | "rollback" | "reject";
  environment: string;
  actor_id: string | null;
  reason: string;
  evidence: Record<string, unknown>;
  created_at: string;
  model_registry: {
    model_name: string;
    horizon_hours: number;
    version: string;
    activation_status: string;
  } | null;
}

export interface ForecastReleaseDecisionsResponse {
  decisions: ForecastReleaseDecision[];
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

export interface ViewportBounds {
  min_lat: number;
  max_lat: number;
  min_lon: number;
  max_lon: number;
}

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
