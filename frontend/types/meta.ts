export interface ReadinessResponse {
  status: "ready" | "not_ready";
  service: "clearpath-api";
  environment: string;
  release: string;
  checks: Record<string, boolean>;
  station_count: number;
  fresh_station_count: number;
  latest_recorded_at: string | null;
  reason: string | null;
}
