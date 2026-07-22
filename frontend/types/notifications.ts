export interface PushConfigResponse {
  enabled: boolean;
  public_key: string | null;
}

export interface NotificationPreferences {
  district: string | null;
  subdistrict: string | null;
  radius_km: number | null;
  center_lat: number | null;
  center_lon: number | null;
  pm25_threshold: number;
  air_alerts: boolean;
  hotspot_alerts: boolean;
  community_alerts: boolean;
  report_status_alerts: boolean;
  rating_alerts: boolean;
  reward_alerts: boolean;
  leaderboard_alerts: boolean;
  announcement_alerts: boolean;
}

export interface UserNotification {
  id: string;
  event_type: string;
  title: string;
  body: string;
  url: string;
  entity_type: string | null;
  entity_id: string | null;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

export interface NotificationsResponse {
  notifications: UserNotification[];
  unread_count: number;
}

export interface OperationResponse {
  ok: boolean;
  message: string;
}
