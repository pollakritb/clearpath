export type ReportStatus = "pending" | "approved" | "rejected";
export type CommunityDataRole = "supplementary" | "gap_fill";
export type GapFillBasis = "none" | "corroborated" | "calibrated_high_trust";
export type RatingDirection = "negative" | "neutral" | "positive";
export type RejectionReason =
  | "image_unclear"
  | "value_mismatch"
  | "suspected_screen_recapture"
  | "invalid_location"
  | "invalid_measurement"
  | "duplicate"
  | "other";
export type AnnouncementStatus = "draft" | "published" | "archived" | "expired";
export interface CaptureSessionResponse {
  token: string;
  session_id: string;
  issued_at: string;
  expires_at: string;
}

export interface CommunityReport {
  id: string;
  user_id: string;
  display_name: string | null;
  lat: number;
  lon: number;
  pm25: number | null;
  ocr_pm25: number | null;
  user_claimed_pm25: number | null;
  admin_verified_pm25: number | null;
  ocr_confidence: number;
  captured_at: string;
  created_at: string;
  status: ReportStatus;
  trust_score: number;
  trust_reasons: string[];
  peer_up: number;
  peer_down: number;
  image_url: string | null;
  admin_verified: boolean;
  data_role: CommunityDataRole;
  nearest_official_distance_km: number | null;
  nearest_official_pm25: number | null;
  eligible_for_gap_fill: boolean;
  is_fresh: boolean;
  age_minutes: number | null;
  location_precision_m: number;
  device_model: string | null;
  device_calibrated: boolean;
  calibrated_at: string | null;
  measurement_environment: "outdoor" | "indoor";
  measurement_stable: boolean;
  near_emission_source: boolean;
  measurement_note: string | null;
  gps_accuracy_m: number | null;
  duplicate_detected: boolean;
  corroboration_count: number;
  gap_fill_basis: GapFillBasis;
  eligibility_reason: string;
  official_recorded_at: string | null;
  averaging_period: "instant" | "1_minute" | "5_minutes";
  measurement_duration_seconds: number;
  province: string | null;
  district: string | null;
  subdistrict: string | null;
  camera_session_issued_at: string | null;
  client_captured_at: string | null;
  server_received_at: string | null;
  moderated_at: string | null;
  clock_warning: boolean;
  ocr_mismatch: boolean;
  rejection_reason_code: RejectionReason | null;
  moderation_checks: Record<string, boolean>;
  evidence_purged_at: string | null;
  policy_version: string;
  rating_count: number;
  rating_average: number | null;
}

export interface CommunityReportsResponse {
  reports: CommunityReport[];
  count: number;
}

export interface CommunityMapPoint {
  id: string;
  lat: number;
  lon: number;
  pm25: number;
  report_count: number;
  reporter_count: number;
  source: "community";
  averaging_period: "instant";
  report_ids: string[];
}

export interface CommunityMapPointsResponse {
  points: CommunityMapPoint[];
  count: number;
}

export interface ReportCreateResponse {
  report: CommunityReport;
  ocr_available: boolean;
  message: string;
}

export interface ReportDraftResponse {
  id: string;
  ocr_pm25: number | null;
  ocr_confidence: number;
  ocr_available: boolean;
  device_detected: boolean;
  display_clear: boolean;
  duplicate_detected: boolean;
  clock_warning: boolean;
  captured_at: string;
  expires_at: string;
  image_preview_url: string | null;
}

export interface ReportDraftSubmit {
  user_claimed_pm25: number;
  display_name?: string | null;
  device_model?: string | null;
  device_calibrated?: boolean;
  calibrated_at?: string | null;
  measurement_environment?: "outdoor";
  measurement_stable?: boolean;
  near_emission_source?: boolean;
  measurement_note?: string | null;
  averaging_period?: "instant" | "1_minute" | "5_minutes";
  measurement_duration_seconds?: number;
}

export interface ReportRatingRequest {
  rating: 1 | 2 | 3 | 4 | 5;
  reviewer_lat: number;
  reviewer_lon: number;
  gps_accuracy_m: number;
  note?: string | null;
}

export interface RatingResult {
  report: CommunityReport;
  rating_count: number;
  rating_average: number;
  consensus: RatingDirection;
  reward_points: number;
}

export interface ModerationChecks {
  image_clear: boolean;
  value_matches_display: boolean;
  location_plausible: boolean;
  no_screen_recapture_signs: boolean;
}

export interface ModerationRequest {
  decision: "approve" | "reject";
  verified_pm25?: number | null;
  rejection_reason_code?: RejectionReason | null;
  checks?: ModerationChecks;
  note?: string | null;
}

export interface UserReputation {
  user_id: string;
  display_name: string | null;
  reputation_score: number;
  approved_reports: number;
  helpful_reviews: number;
  weekly_points: number;
  badges: string[];
  role: "user" | "moderator" | "admin";
}

export interface CommunityProfileResponse extends UserReputation {
  created_at: string | null;
  reports: CommunityReport[];
}

export interface LeaderboardResponse {
  users: UserReputation[];
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  kind: "news" | "alert" | "community";
  area: string | null;
  published_at: string;
  expires_at: string | null;
  status: AnnouncementStatus;
  image_url: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface AnnouncementCreate {
  title: string;
  body: string;
  kind: "news" | "alert" | "community";
  area?: string | null;
  expires_at?: string | null;
  status?: AnnouncementStatus;
  image_path?: string | null;
}

export interface AnnouncementUpdate {
  title?: string | null;
  body?: string | null;
  kind?: "news" | "alert" | "community" | null;
  area?: string | null;
  expires_at?: string | null;
  status?: AnnouncementStatus | null;
  image_path?: string | null;
}

export interface AnnouncementsResponse {
  announcements: Announcement[];
}

export interface Activity {
  id: string;
  title: string;
  description: string;
  reward_points: number;
  starts_at: string | null;
  ends_at: string | null;
  active: boolean;
}

export interface ActivityCreate {
  title: string;
  description: string;
  reward_points: number;
  starts_at?: string | null;
  ends_at?: string | null;
}

export interface ActivitiesResponse {
  activities: Activity[];
}
