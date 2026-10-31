"""XP contracts; public member IDs are independent of authentication IDs."""

from typing import Literal

from pydantic import BaseModel, Field


class ParticipationRank(BaseModel):
    code: str
    label: str
    minimum_xp: int
    minimum_days: int
    next_label: str | None = None
    next_xp: int | None = None
    next_days: int | None = None


class XPSummary(BaseModel):
    member_id: str
    alias: str
    hidden: bool = False
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


class XPResult(BaseModel):
    status: Literal["pending", "granted", "not_eligible", "disabled"] = "pending"
    report_xp: int = 0
    help_xp: int = 0
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
    period: Literal["all", "7d", "30d"]
    users: list[XPLeader]
    me: XPLeader | None = None
    next_offset: int | None = None


class HelpClaim(BaseModel):
    request_id: str
    started_at: str
    deadline: str
    potential_xp: int = 5


class PublicMember(BaseModel):
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


class XPReversalRequest(BaseModel):
    reason: str = Field(min_length=10, max_length=500)


class OwnedReportIDs(BaseModel):
    ids: list[str]
