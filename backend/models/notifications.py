"""PWA Web Push subscription and preference contracts."""

from pydantic import BaseModel, Field


class PushKeys(BaseModel):
    p256dh: str = Field(min_length=20, max_length=512)
    auth: str = Field(min_length=8, max_length=256)


class PushSubscriptionRequest(BaseModel):
    endpoint: str = Field(min_length=20, max_length=2048)
    keys: PushKeys
    user_agent: str | None = Field(default=None, max_length=500)


class PushUnsubscribeRequest(BaseModel):
    endpoint: str = Field(min_length=20, max_length=2048)


class NotificationPreferences(BaseModel):
    district: str | None = Field(default=None, max_length=100)
    subdistrict: str | None = Field(default=None, max_length=100)
    radius_km: float | None = Field(default=None, ge=1, le=50)
    center_lat: float | None = Field(default=None, ge=-90, le=90)
    center_lon: float | None = Field(default=None, ge=-180, le=180)
    pm25_threshold: float = Field(default=37.5, ge=0, le=500)
    air_alerts: bool = True
    hotspot_alerts: bool = True
    community_alerts: bool = False
    report_status_alerts: bool = True
    rating_alerts: bool = True
    reward_alerts: bool = True
    leaderboard_alerts: bool = False
    announcement_alerts: bool = True


class UserNotification(BaseModel):
    id: str
    event_type: str
    title: str
    body: str
    url: str = "/"
    entity_type: str | None = None
    entity_id: str | None = None
    payload: dict = Field(default_factory=dict)
    read_at: str | None = None
    created_at: str


class NotificationsResponse(BaseModel):
    notifications: list[UserNotification]
    unread_count: int


class PushConfigResponse(BaseModel):
    enabled: bool
    public_key: str | None = None


class OperationResponse(BaseModel):
    ok: bool
    message: str
