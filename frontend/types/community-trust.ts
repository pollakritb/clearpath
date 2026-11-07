export interface CommunityTrustDay {
  day: string;
  positive: number;
  negative: number;
  count: number;
  value: number;
  weight: number;
}
export interface CommunityTrust {
  policy_version: string;
  status: "insufficient" | "available" | "updating" | "unavailable";
  score: number | null;
  window_start: string | null;
  window_end: string | null;
  unique_voter_accounts: number;
  evaluated_report_count: number;
  evaluated_day_count: number;
  effective_day_weight: number;
  last_feedback_at: string | null;
  calculated_at: string | null;
  contribution_days_30: number;
  review_available: boolean;
  daily: CommunityTrustDay[];
}
export interface CommunityTrustReview {
  report_id?: string | null;
  from_day?: string | null;
  to_day?: string | null;
  message: string;
}

export interface CommunityTrustReviewItem {
  id: string;
  status: string;
  created_at: string;
  from_day?: string | null;
  to_day?: string | null;
  message?: string | null;
  reason?: string | null;
}
export interface CommunityTrustReviews {
  requests: CommunityTrustReviewItem[];
}
