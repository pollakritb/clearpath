export interface ForecastGridMetadata {
  status: "ready" | "unavailable";
  generation_id: string | null;
  grid_version: string | null;
  provider: string;
  domain: string;
  unit: string;
  retrieved_at: string | null;
  retrieval_started_at: string | null;
  model_issued_at: string | null;
  stale: boolean;
  latitudes: number[];
  longitudes: number[];
  valid_times: string[];
  bounds: number[];
  native_resolution_degrees: number;
  native_time_step_hours: number;
  attribution: string;
  attribution_url: string;
}
export interface ForecastGridFrame {
  valid_at: string;
  values: (number | null)[];
}
export interface ForecastGridFrames {
  generation_id: string;
  grid_version: string;
  row_start: number;
  column_start: number;
  rows: number;
  columns: number;
  frames: ForecastGridFrame[];
}
