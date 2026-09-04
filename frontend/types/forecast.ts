export interface ForecastQuality {
  status: "limited" | "sufficient";
  ml_eligible: boolean;
  reason_codes: string[];
  warnings: string[];
  source_recorded_at: string | null;
  input_freshness_minutes: number | null;
  source_points: number;
  recent_required_points: number;
  missing_hours: number;
  duplicate_hours: number;
  optional_feature_completeness: number;
  optional_feature_states: Record<string, string>;
}

export interface ForecastPoint {
  horizon_hours: number;
  forecast_at: string;
  pm25: number;
  lower: number;
  upper: number;
  method: string;
  model_version: string | null;
  feature_version: string | null;
  artifact_sha256: string | null;
  coverage_target: number;
  calibration_version: string;
  agreement: "high" | "medium" | "low" | null;
  provider_count: number;
  source: ForecastSource;
}

export type ForecastSource =
  "clearpath" | "gistda" | "openmeteo_cams" | "openweather";

export interface ForecastSourcePoint {
  source: ForecastSource;
  horizon_hours: number;
  forecast_at: string;
  pm25: number;
  lower: number | null;
  upper: number | null;
  weight: number;
  available: boolean;
  issued_at: string | null;
}

export interface ForecastProviderSummary {
  source: Exclude<ForecastSource, "clearpath">;
  label: string;
  attribution: string;
  attribution_url: string;
  available: boolean;
  selected: boolean;
  latest_issued_at: string | null;
  freshness_status: "fresh" | "stale" | "unavailable";
  coverage_hours: number;
  maximum_horizon_hours: number;
  stale_after_hours: number;
  usage_note: string;
}

export interface ForecastCommunityContext {
  mode: "not_used" | "context_only" | "shadow" | "served";
  affects_recommendation: boolean;
  eligible_report_count: number;
  nearby_report_count: number;
  effective_sample_size: number;
  residual_pm25: number;
  trust_threshold: number;
  radius_km: number;
  policy: string;
}

export interface ForecastResponse {
  station_id: string;
  generated_at: string;
  source_recorded_at: string | null;
  horizon_hours: number;
  method: string;
  source_points: number;
  model_version: string | null;
  feature_version: string | null;
  artifact_sha256: string | null;
  coverage_target: number;
  data_quality: "limited" | "sufficient";
  quality: ForecastQuality;
  fallback_reason: string | null;
  fallback_reason_codes: string[];
  warnings: string[];
  points: ForecastPoint[];
  forecast_status: "available" | "limited" | "unavailable";
  limitation_reason_codes: string[];
  unavailable_reason_codes: string[];
  agreement: "high" | "medium" | "low" | null;
  provider_count: number;
  sources: ForecastSourcePoint[];
  provenance: Record<string, unknown>;
  forecast_mode: "external_provider" | "local_fallback" | "unavailable";
  recommended_source: ForecastSource | null;
  providers: ForecastProviderSummary[];
  community_context: ForecastCommunityContext;
}

export interface ForecastSurfaceCell {
  lat: number;
  lon: number;
  pm25: number | null;
  lower: number | null;
  upper: number | null;
  coverage: "covered" | "sparse" | "unavailable";
  nearby_station_count: number;
  nearest_station_km: number | null;
}

export interface ForecastSurfaceResponse {
  generated_at: string;
  horizon_hours: number;
  method: string;
  source_policy: "official_stations_only";
  station_count: number;
  grid_size: number;
  bounds: Record<string, number>;
  coverage_counts: Record<string, number>;
  warnings: string[];
  cells: ForecastSurfaceCell[];
}
