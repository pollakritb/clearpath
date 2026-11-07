"""Authenticated XP settings, event history and explicitly claimed help tasks."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from backend.services import store_client

from ..core.auth import (
    AuthenticatedUser,
    require_admin,
    require_user,
)
from ..core.identifiers import MemberID, ReportID, RequestID
from ..models.evidence import ContributionMissions
from ..models.xp import (
    HelpClaim,
    OwnedReportIDs,
    PublicMember,
    XPAdminOverview,
    XPEventsResponse,
    XPLeaderboard,
    XPResult,
    XPSettings,
    XPSummary,
)
from ..services.community import xp

router = APIRouter(prefix="/community")
User = Annotated[AuthenticatedUser, Depends(require_user)]


@router.get("/me/leaderboard", response_model=XPLeaderboard)
def my_board(
    user: User,
    period: str | None = Query(
        None, pattern=r"^(all|7d|30d|month|[0-9]{4}-(0[1-9]|1[0-2]))$"
    ),
    offset: Annotated[int, Query(ge=0, le=100000)] = 0,
):
    try:
        return xp.board(period, offset, user.id)
    except ValueError as exc:
        raise HTTPException(422, detail="เดือนอันดับไม่ถูกต้อง") from exc


@router.get("/me/xp", response_model=XPSummary | None)
def summary(user: User):
    return xp.summary(user.id)


@router.put("/me/xp", response_model=XPSummary)
def settings(body: XPSettings, user: User):
    try:
        return xp.update_settings(user.id, body.model_dump())
    except ValueError as exc:
        raise HTTPException(400, detail=str(exc)) from exc


@router.get("/me/xp-events", response_model=XPEventsResponse)
def history(user: User, offset: Annotated[int, Query(ge=0, le=100000)] = 0):
    rows = xp.events(user.id, offset, 51) if xp.enabled() else []
    from ..algorithms.community_xp import REASONS

    return dict(
        events=[
            e | {"reason": REASONS.get(e["reason"], e["reason"])} for e in rows[:50]
        ],
        next_offset=offset + 50 if len(rows) > 50 else None,
    )


@router.post("/help-claims/{request_id}", response_model=HelpClaim)
def claim(request_id: RequestID, user: User):
    try:
        return xp.claim(user.id, str(request_id))
    except (KeyError, ValueError) as exc:
        raise HTTPException(400, detail="คำขอนี้ไม่เปิดรับผู้ช่วยใหม่") from exc


@router.get("/me/reports/{report_id}/xp", response_model=XPResult)
def report_result(report_id: ReportID, user: User):
    from ..services import supabase_client as db

    row = db.get_community_report(str(report_id))
    if not row or str(row["user_id"]) != user.id:
        raise HTTPException(404, detail="ไม่พบรายงาน")
    return XPResult(**xp.reward_report(row))


@router.get("/me/report-ids", response_model=OwnedReportIDs)
def owned_ids(user: User):
    from datetime import UTC, datetime, timedelta

    from ..services.measurement.store import pages

    if xp.settings.local_demo_mode:
        from ..services import local_store

        return {
            "ids": [
                str(r["id"])
                for r in local_store.list_reports("all", 5000)
                if str(r["user_id"]) == user.id
            ]
        }
    since = (datetime.now(UTC) - timedelta(hours=27)).isoformat()
    return {
        "ids": [
            str(r["id"])
            for r in pages(
                lambda: (
                    store_client.get_client()
                    .table("community_reports")
                    .select("id")
                    .eq("user_id", user.id)
                    .gte("captured_at", since)
                    .order("id")
                )
            )
        ]
    }


@router.get("/members/{member_id}", response_model=PublicMember)
def member(member_id: MemberID):
    try:
        return PublicMember(**xp.public_member(str(member_id)))
    except KeyError as exc:
        raise HTTPException(404, detail="สมาชิกนี้ไม่เปิดโปรไฟล์สาธารณะ") from exc


@router.get("/xp/admin", response_model=XPAdminOverview)
def overview(admin: Annotated[AuthenticatedUser, Depends(require_admin)]):
    return XPAdminOverview(**xp.admin_overview())


@router.get("/missions", response_model=ContributionMissions)
def coverage_tasks():
    from ..services.community import missions

    return {"missions": missions.available()}
