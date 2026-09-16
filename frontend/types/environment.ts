export interface Weather {
  temp: number;
  humidity: number;
  wind_speed: number;
  wind_deg: number;
  description: string;
  icon: string | null;
  source: "openweather" | "open_meteo";
}

export interface FirePoint {
  id: string;
  lat: number;
  lon: number;
  frp: number | null;
  bright: number | null;
  daynight: string | null;
  acq_date: string | null;
  acquired_at: string | null;
  confidence: string | null;
  satellite: string | null;
  source_products: string[];
}

export type FirmsStatus =
  | "available"
  | "checked_no_hotspots"
  | "stale"
  | "unavailable"
  | "unconfigured";

export interface FirmsResponse {
  fires: FirePoint[];
  count: number;
  available: boolean;
  status: FirmsStatus;
  checked_at: string;
  latest_acquired_at: string | null;
  max_age_hours: number;
  message: string | null;
  source: "nasa_firms";
}
