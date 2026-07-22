"""Admin moderation API protected by verified Supabase roles."""

from datetime import UTC, datetime
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from starlette.concurrency import run_in_threadpool

from ..core.auth import AuthenticatedUser, require_admin, require_moderator
from ..models.schemas import (
    Activity,
    ActivityCreate,
    Announcement,
    AnnouncementCreate,
    AnnouncementsResponse,
    AnnouncementUpdate,
    CommunityReport,
    CommunityReportsResponse,
    ModerationRequest,
)
from ..services import community as community_service
from ..services import notifications, supabase_client
from ..services.forecast_models import artifact_statuses

router = APIRouter()


@router.get("/admin/reports", response_model=CommunityReportsResponse)
async def moderation_queue(
    limit: int = Query(100, ge=1, le=200),
    _user: AuthenticatedUser = Depends(require_moderator),
):
    rows = await run_in_threadpool(community_service.list_reports, "pending", limit)
    return CommunityReportsResponse(
        reports=[CommunityReport(**r) for r in rows], count=len(rows)
    )


@router.post("/admin/reports/{report_id}/moderate", response_model=CommunityReport)
async def moderate(
    report_id: str,
    body: ModerationRequest,
    user: AuthenticatedUser = Depends(require_moderator),
):
    try:
        row = await run_in_threadpool(
            community_service.moderate_report,
            report_id,
            user.id,
            body.decision,
            body.verified_pm25,
            body.note,
            body.rejection_reason_code,
            body.checks.model_dump(),
        )
    except KeyError as exc:
        raise HTTPException(404, detail="ไม่พบรายงาน") from exc
    except ValueError as exc:
        raise HTTPException(400, detail=str(exc)) from exc
    return CommunityReport(**row)


@router.post("/admin/announcements", response_model=Announcement, status_code=201)
async def create_announcement(
    body: AnnouncementCreate,
    user: AuthenticatedUser = Depends(require_admin),
):
    now = datetime.now(UTC).isoformat()
    row = await run_in_threadpool(
        supabase_client.create_announcement,
        {
            "id": str(uuid4()),
            **body.model_dump(),
            "published": body.status == "published",
            "published_at": now,
            "created_by": user.id,
            "updated_by": user.id,
            "created_at": now,
            "updated_at": now,
        },
    )
    await run_in_threadpool(
        supabase_client.create_audit_log,
        {
            "actor_id": user.id,
            "action": "announcement_created",
            "entity_type": "announcement",
            "entity_id": str(row["id"]),
            "details": {"status": body.status},
        },
    )
    if body.status == "published":
        for user_id in await run_in_threadpool(supabase_client.list_user_ids, 2000):
            await run_in_threadpool(
                notifications.enqueue_user_notification,
                user_id=user_id,
                event_type="announcement",
                title=body.title,
                body=body.body[:240],
                deduplication_key=f"announcement:{row['id']}",
                url="/",
                entity_type="announcement",
                entity_id=str(row["id"]),
                payload={"kind": body.kind, "area": body.area},
            )
    return Announcement(**row)


@router.get("/admin/announcements", response_model=AnnouncementsResponse)
async def admin_announcements(
    limit: int = Query(100, ge=1, le=200),
    _user: AuthenticatedUser = Depends(require_admin),
):
    rows = await run_in_threadpool(supabase_client.list_admin_announcements, limit)
    return AnnouncementsResponse(announcements=[Announcement(**row) for row in rows])


@router.patch("/admin/announcements/{announcement_id}", response_model=Announcement)
async def update_announcement(
    announcement_id: str,
    body: AnnouncementUpdate,
    user: AuthenticatedUser = Depends(require_admin),
):
    values = body.model_dump(exclude_unset=True)
    if "status" in values:
        values["published"] = values["status"] == "published"
    values.update({"updated_by": user.id, "updated_at": datetime.now(UTC).isoformat()})
    try:
        row = await run_in_threadpool(
            supabase_client.update_announcement, announcement_id, values
        )
    except KeyError as exc:
        raise HTTPException(404, detail="ไม่พบประกาศ") from exc
    await run_in_threadpool(
        supabase_client.create_audit_log,
        {
            "actor_id": user.id,
            "action": "announcement_updated",
            "entity_type": "announcement",
            "entity_id": announcement_id,
            "details": values,
        },
    )
    if values.get("status") == "published":
        for user_id in await run_in_threadpool(supabase_client.list_user_ids, 2000):
            await run_in_threadpool(
                notifications.enqueue_user_notification,
                user_id=user_id,
                event_type="announcement",
                title=str(row["title"]),
                body=str(row["body"])[:240],
                deduplication_key=f"announcement:{row['id']}",
                url="/",
                entity_type="announcement",
                entity_id=str(row["id"]),
                payload={"kind": row.get("kind"), "area": row.get("area")},
            )
    return Announcement(**row)


@router.delete("/admin/announcements/{announcement_id}", response_model=Announcement)
async def archive_announcement(
    announcement_id: str,
    user: AuthenticatedUser = Depends(require_admin),
):
    try:
        row = await run_in_threadpool(
            supabase_client.update_announcement,
            announcement_id,
            {
                "status": "archived",
                "published": False,
                "updated_by": user.id,
                "updated_at": datetime.now(UTC).isoformat(),
            },
        )
    except KeyError as exc:
        raise HTTPException(404, detail="ไม่พบประกาศ") from exc
    await run_in_threadpool(
        supabase_client.create_audit_log,
        {
            "actor_id": user.id,
            "action": "announcement_archived",
            "entity_type": "announcement",
            "entity_id": announcement_id,
            "details": {},
        },
    )
    return Announcement(**row)


@router.post("/admin/announcement-images")
async def upload_announcement_image(
    image: UploadFile = File(...),
    _user: AuthenticatedUser = Depends(require_admin),
):
    content_type = image.content_type or ""
    if content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(415, detail="รองรับเฉพาะ JPEG, PNG หรือ WEBP")
    content = await image.read(5 * 1024 * 1024 + 1)
    if not content or len(content) > 5 * 1024 * 1024:
        raise HTTPException(413, detail="ภาพต้องไม่เกิน 5 MB")
    extension = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}[
        content_type
    ]
    path = f"{datetime.now(UTC):%Y/%m}/{uuid4()}.{extension}"
    url = await run_in_threadpool(
        supabase_client.upload_announcement_image, path, content, content_type
    )
    return {"path": path, "url": url}


@router.post("/admin/activities", response_model=Activity, status_code=201)
async def create_activity(
    body: ActivityCreate,
    _user: AuthenticatedUser = Depends(require_admin),
):
    row = await run_in_threadpool(
        supabase_client.create_activity,
        {"id": str(uuid4()), **body.model_dump(), "active": True},
    )
    return Activity(**row)


@router.get("/admin/sync-runs")
async def sync_runs(
    limit: int = Query(50, ge=1, le=200),
    _user: AuthenticatedUser = Depends(require_moderator),
):
    rows = await run_in_threadpool(supabase_client.list_sync_runs, limit)
    return {"runs": rows, "count": len(rows)}


@router.get("/admin/forecast-models")
async def forecast_models(
    _user: AuthenticatedUser = Depends(require_moderator),
):
    models = await run_in_threadpool(artifact_statuses)
    return {"models": models, "count": len(models)}


@router.get("/admin/notification-outbox")
async def notification_outbox(
    _user: AuthenticatedUser = Depends(require_moderator),
):
    return await run_in_threadpool(supabase_client.notification_outbox_summary)
