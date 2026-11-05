export interface EvidenceComponent {
  code: string;
  maximum: number;
  points: number;
  state: "verified" | "declared" | "invalid" | "unknown";
  reason: string;
}
export interface ReportEvidence {
  policy_version: string;
  score: number;
  components: EvidenceComponent[];
  blockers: string[];
  scored_at: string | null;
  device_evaluated_at?: string | null;
  device_valid_until?: string | null;
  device_method?: string | null;
  device_status: "unknown" | "identified" | "evaluation_available";
}
export interface HistoryCheckSummary {
  passed: number;
  problems: number;
  unresolved: number;
  evaluated: number;
  pass_rate: number | null;
  status: string;
  scope: string;
  first_checked_at?: string | null;
  last_checked_at?: string | null;
}
export interface EvidenceHistory extends HistoryCheckSummary {
  scopes: Record<string, HistoryCheckSummary>;
}
export interface ContributionMission {
  id: string;
  place_name: string;
  lat: number;
  lon: number;
  radius_km: number;
  starts_at: string;
  expires_at: string;
  potential_points: number;
}
export interface ContributionMissions {
  missions: ContributionMission[];
}
