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
  lat: number;
  lon: number;
  frp: number | null;
  bright: number | null;
  daynight: string | null;
  acq_date: string | null;
  acquired_at: string | null;
  confidence: string | null;
  satellite: string | null;
}

export interface FirmsResponse {
  fires: FirePoint[];
  count: number;
  available: boolean;
  message: string | null;
  source: "nasa_firms";
}
