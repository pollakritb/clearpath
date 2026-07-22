export interface ForecastPoint {
  forecast_at: string;
  pm25: number;
  lower: number;
  upper: number;
}

export interface ForecastResponse {
  station_id: string;
  generated_at: string;
  horizon_hours: number;
  method: string;
  source_points: number;
  model_version: string | null;
  data_quality: "limited" | "sufficient";
  fallback_reason: string | null;
  points: ForecastPoint[];
}
