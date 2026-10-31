export interface ParticipationRank {
  code: string;
  label: string;
  minimum_xp: number;
  minimum_days: number;
  next_label: string | null;
  next_xp: number | null;
  next_days: number | null;
}
export interface XPSummary {
  member_id: string;
  alias: string;
  hidden: boolean;
  lifetime_xp: number;
  contribution_days: number;
  report_count: number;
  help_count: number;
  today_reports: number;
  today_help: number;
  rank: ParticipationRank;
  achievements: string[];
}
export interface XPSettings {
  alias: string;
  hidden: boolean;
}
export interface XPResult {
  status: "pending" | "granted" | "not_eligible" | "disabled";
  report_xp: number;
  help_xp: number;
  reason: string | null;
  bonus_reason: string | null;
}
export interface XPEvent {
  id: string;
  report_id: string | null;
  kind: string;
  points: number;
  reason: string;
  occurred_at: string;
  recorded_at: string;
  policy_version: string;
}
export interface XPEventsResponse {
  events: XPEvent[];
  next_offset: number | null;
}
export interface XPLeader {
  member_id: string;
  alias: string;
  rank: number | null;
  xp: number;
  lifetime_xp: number;
  title: ParticipationRank;
}
export interface XPLeaderboard {
  period: "all" | "7d" | "30d";
  users: XPLeader[];
  me: XPLeader | null;
  next_offset: number | null;
}
export interface HelpClaim {
  request_id: string;
  started_at: string;
  deadline: string;
  potential_xp: number;
}
export interface PublicMember {
  member_id: string;
  alias: string;
  lifetime_xp: number;
  contribution_days: number;
  rank: ParticipationRank;
  achievements: string[];
}
export interface XPAdminEvent extends XPEvent {
  user_id: string;
  request_id: string | null;
  requester_id: string | null;
  reversed: boolean;
}
export interface XPAdminOverview {
  pending_jobs: number;
  accounts: number;
  zero_reasons: Record<string, number>;
  repeated_pairs: number;
  events: XPAdminEvent[];
}

export interface XPReversalRequest {
  reason: string;
}
export interface OwnedReportIDs {
  ids: string[];
}
