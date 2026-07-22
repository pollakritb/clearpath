export interface Station {
  id: string;
  name_th: string | null;
  name_en: string | null;
  lat: number;
  lon: number;
  province: string | null;
  pm25: number | null;
  aqi: number | null;
  color: string | null;
  level: string | null;
  recorded_at: string | null;
  data_status: "fresh" | "delayed" | "expired";
  age_minutes: number | null;
  eligible_for_surface: boolean;
}

export interface StationsResponse {
  stations: Station[];
  count: number;
  updated_at: string | null;
  fresh_count: number;
  delayed_count: number;
  expired_count: number;
}

export interface HistoryPoint {
  recorded_at: string;
  pm25: number | null;
  aqi: number | null;
}

export interface HistoryResponse {
  station_id: string;
  points: HistoryPoint[];
}
