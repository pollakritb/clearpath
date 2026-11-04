import type { HelpClaim } from "./xp";
import type { CommunityReport } from "./community";
export type RequestStatus =
  "scheduled" | "active" | "fulfilled" | "expired" | "cancelled";
export interface MeasurementRequestCreate {
  place_name: string;
  lat: number;
  lon: number;
  radius_km: 1 | 3 | 5;
  needed_by?: string | null;
  idempotency_key: string;
}
export interface MeasurementHelperLocationWrite {
  name: string;
  address: string;
  lat: number;
  lon: number;
  enabled: boolean;
}
export interface MeasurementHelperLocation extends MeasurementHelperLocationWrite {
  slot: 1 | 2;
}
export interface MeasurementHelperSettings {
  enabled: boolean;
  observed_at: string | null;
  registered_locations_enabled?: boolean;
  locations?: MeasurementHelperLocation[];
}
export interface MeasurementHelperConsent {
  enabled: boolean;
}
export interface MeasurementPresenceUpdate {
  lat: number;
  lon: number;
  accuracy_m: number;
  observed_at: string;
}
export interface MeasurementRequestView {
  requester_name: string | null;
  help_claim?: HelpClaim | null;
  xp_enabled?: boolean;
  automatic_help_enabled?: boolean;
  id: string;
  place_name: string;
  lat: number;
  lon: number;
  radius_km: 1 | 3 | 5;
  starts_at: string;
  expires_at: string;
  created_at: string;
  status: RequestStatus;
  is_owner: boolean;
  recipient_count: number;
  declined: boolean;
  matched_location_at: string | null;
  matched_location_source?: "gps" | "registered" | null;
  result: CommunityReport | null;
  result_distance_km: number | null;
}
export interface MeasurementRequestsResponse {
  requests: MeasurementRequestView[];
}
