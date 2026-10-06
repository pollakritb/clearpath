export interface LocationSuggestion {
  id: string;
  name: string;
  address: string;
  kind: string;
  source: "geoapify" | "openstreetmap" | "local";
  lat: number;
  lon: number;
}

export interface LocationSearchResponse {
  locations: LocationSuggestion[];
  coverage: "nationwide" | "limited";
}
