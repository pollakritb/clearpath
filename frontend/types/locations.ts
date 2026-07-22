export interface LocationSuggestion {
  id: string;
  name: string;
  district: string;
  kind: "district" | "subdistrict";
  lat: number;
  lon: number;
}

export interface LocationSearchResponse {
  locations: LocationSuggestion[];
}
