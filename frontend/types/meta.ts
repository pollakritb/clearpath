export interface ReadinessResponse {
  status: "ready" | "not_ready";
  service: "clearpath-api";
  environment: string;
  release: string;
  checks: Record<string, boolean>;
  station_count: number;
  fresh_station_count: number;
  delayed_station_count: number;
  expired_station_count: number;
  fresh_max_age_minutes: number;
  surface_max_age_minutes: number;
  latest_recorded_at: string | null;
  reason: string | null;
}
