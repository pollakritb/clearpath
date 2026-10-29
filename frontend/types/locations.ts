export interface LocationSuggestion {
  id: string;
  name: string;
  address: string;
  kind: string;
  source: "geoapify" | "openstreetmap" | "photon" | "local";
  lat: number;
  lon: number;
}

export interface LocationSearchResponse {
  locations: LocationSuggestion[];
  coverage: "nationwide" | "limited";
}

export interface LocationLabelResponse {
  name: string;
  address: string;
  source: "geoapify" | "photon" | "local";
}
