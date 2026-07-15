// typed fetch wrappers — frontend รู้จักแค่ /api/* (same-origin)

import type {
  FirmsResponse,
  GeocodeResponse,
  HistoryResponse,
  RouteCompareRequest,
  RouteCompareResponse,
  StationsResponse,
  ValidationResponse,
  Weather,
} from "@/frontend/types";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function http<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (body?.detail) detail = body.detail;
    } catch {
      /* ignore non-JSON error body */
    }
    throw new ApiError(detail, res.status);
  }
  return (await res.json()) as T;
}

export const api = {
  pm25Current: () => http<StationsResponse>("/api/pm25/current"),

  compareRoutes: (body: RouteCompareRequest) =>
    http<RouteCompareResponse>("/api/route/compare", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  weather: (lat: number, lon: number) =>
    http<Weather>(`/api/weather?lat=${lat}&lon=${lon}`),

  firms: (days = 1) => http<FirmsResponse>(`/api/firms?days=${days}`),

  history: (stationId: string, hours = 24) =>
    http<HistoryResponse>(
      `/api/history?station_id=${encodeURIComponent(stationId)}&hours=${hours}`,
    ),

  geocode: (q: string) =>
    http<GeocodeResponse>(`/api/geocode?q=${encodeURIComponent(q)}`),

  validate: (method: "idw" | "kriging" | "both" = "both") =>
    http<ValidationResponse>(`/api/validate?method=${method}`),
};
