// TS contract — ต้องตรงกับ backend/models/schemas.py

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
}

export interface StationsResponse {
  stations: Station[];
  count: number;
  updated_at: string | null;
}

export interface Coordinate {
  lat: number;
  lon: number;
  label?: string | null;
}

export interface SamplePoint {
  lat: number;
  lon: number;
  pm25: number;
}

export interface RouteResult {
  id: string;
  label: string;
  distance_km: number;
  duration_min: number;
  avg_pm25: number;
  max_pm25: number;
  level: string | null;
  color: string | null;
  geometry: [number, number][]; // [[lat, lon], ...]
  samples: SamplePoint[];
  covered: boolean; // ประเมินค่าฝุ่นได้ไหม (false = ไม่มีสถานีในบริเวณ)
  confidence: number; // 0..1 ความเชื่อมั่นค่าประมาณ (พื้นที่เซนเซอร์เบาบาง)
  confidence_label: string | null; // สูง / ปานกลาง / ต่ำ
  avg_nearest_km: number | null; // ระยะเฉลี่ยถึงสถานีใกล้สุด
}

export interface RouteCompareResponse {
  routes: RouteResult[];
  recommended_id: string;
  reason: string;
  start: Coordinate;
  end: Coordinate;
  method: string;
}

export interface RouteCompareRequest {
  start_query?: string;
  end_query?: string;
  start_lat?: number;
  start_lon?: number;
  end_lat?: number;
  end_lon?: number;
  method?: "idw" | "kriging";
}

export interface Weather {
  temp: number;
  humidity: number;
  wind_speed: number;
  wind_deg: number;
  description: string;
  icon: string | null;
}

export interface FirePoint {
  lat: number;
  lon: number;
  frp: number | null;
  bright: number | null;
  daynight: string | null;
  acq_date: string | null;
}

export interface FirmsResponse {
  fires: FirePoint[];
  count: number;
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

export interface LoocvMetrics {
  n: number;
  mae: number | null;
  rmse: number | null;
  me: number | null;
  r2: number | null;
  skill: number | null; // skill score เทียบ baseline ค่าเฉลี่ยรวม
}

export interface ValidationResponse {
  idw: LoocvMetrics | null;
  kriging: LoocvMetrics | null;
  mean: LoocvMetrics | null; // baseline: ค่าเฉลี่ยรวม
  nearest: LoocvMetrics | null; // baseline: สถานีใกล้สุด (Thiessen)
  station_count: number;
  better: string | null; // "idw" / "kriging" / "tie"
}

export interface GeocodeResult {
  lat: number;
  lon: number;
  label: string;
}

export interface GeocodeResponse {
  results: GeocodeResult[];
}
