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

export interface ReporterTrust {
  policy_version: string;
  status: "evaluated" | "insufficient" | "unavailable";
  validation_status: "candidate" | "validated";
  score: number | null;
  passed: number;
  problems: number;
  unresolved: number;
  evaluated: number;
  excluded_cases: number;
  prior_alpha: number;
  prior_beta: number;
  first_checked_at: string | null;
  last_checked_at: string | null;
}

export interface ReporterAuditView {
  audit_key: string;
  report_id: string;
  revision: number;
  outcome: "pass" | "problem" | "unresolved";
  fault_domain: "reporting" | "device" | "system" | "unknown";
  evaluated_at: string;
}
export interface ReporterAuditHistory {
  audits: ReporterAuditView[];
  next_offset: number | null;
}
export interface ReporterReviewRequest {
  audit_key: string;
  message: string;
}
export interface ReporterReviewResult {
  id: string;
  status: "pending" | "reviewed";
}
