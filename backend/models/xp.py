"""XP contracts; public member IDs are independent of authentication IDs."""

from typing import Literal

from pydantic import BaseModel, Field

from .community_trust import CommunityTrust
from .evidence import EvidenceHistory


class ParticipationRank(BaseModel):
    code: str
    label: str
    minimum_xp: int
    minimum_days: int
    next_label: str | None = None
    next_xp: int | None = None
    next_days: int | None = None


class XPSummary(BaseModel):
    scheduled_policy_version: str | None = None
    scheduled_starts_at: str | None = None
    xp_paused: bool = False
    community_trust: CommunityTrust | None = None
    member_id: str
    alias: str
    hidden: bool = False
    identity_mode: Literal["google", "alias"] = "google"
    policy_version: str = "xp-v1"
    launched_at: str | None = None
    month_rank: int | None = None
    month_points: int = 0
    week_days: int = 0
    fulfilled_requests: int | None = None
    missions_completed: int = 0
    evidence_history: EvidenceHistory | None = None
    lifetime_xp: int = 0
    contribution_days: int = 0
    report_count: int = 0
    help_count: int = 0
    today_reports: int = 0
    today_help: int = 0
    rank: ParticipationRank
    achievements: list[str] = Field(default_factory=list)


class XPSettings(BaseModel):
    alias: str = Field(min_length=3, max_length=40, pattern=r"^[\w\u0E00-\u0E7F .-]+$")
    hidden: bool
    identity_mode: Literal["google", "alias"] | None = None


class XPResult(BaseModel):
    status: Literal["pending", "granted", "not_eligible", "disabled"] = "pending"
    first_day_xp: int = 0
    week_xp: int = 0
    policy_version: str = "xp-v1"
    report_xp: int = 0
    help_xp: int = 0
    matched_request_count: int = 0
    reason: str | None = None
    bonus_reason: str | None = None


class XPEvent(BaseModel):
    id: str
    report_id: str | None = None
    kind: str
    points: int
    reason: str
    occurred_at: str
    recorded_at: str
    policy_version: str


class XPEventsResponse(BaseModel):
    events: list[XPEvent]
    next_offset: int | None = None


class XPLeader(BaseModel):
    member_id: str
    alias: str
    rank: int | None = None
    xp: int
    lifetime_xp: int
    title: ParticipationRank


class XPLeaderboard(BaseModel):
    period: str
    month: str | None = None
    launched_at: str | None = None
    provisional: bool = True
    revision: int = 0
    frozen_at: str | None = None
    users: list[XPLeader]
    me: XPLeader | None = None
    next_offset: int | None = None


class HelpClaim(BaseModel):
    request_id: str
    started_at: str
    deadline: str
    potential_xp: int = 5


class PublicMember(BaseModel):
    community_trust: CommunityTrust | None = None
    evidence_history: EvidenceHistory | None = None
    member_id: str
    alias: str
    lifetime_xp: int
    contribution_days: int
    rank: ParticipationRank
    achievements: list[str]


class XPAdminEvent(XPEvent):
    user_id: str
    request_id: str | None = None
    requester_id: str | None = None
    reversed: bool = False


class XPAdminOverview(BaseModel):
    pending_jobs: int
    accounts: int
    zero_reasons: dict[str, int]
    repeated_pairs: int
    events: list[XPAdminEvent]


class OwnedReportIDs(BaseModel):
    ids: list[str]
