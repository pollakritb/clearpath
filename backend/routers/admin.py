"""Admin operations and read-only audit APIs protected by Supabase roles."""

import csv
import io
import json
from datetime import UTC, datetime
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile
from starlette.concurrency import run_in_threadpool

from ..core.auth import AuthenticatedUser, require_admin, require_moderator
from ..models.admin import (
    DataHealthResponse,
    DataIssueUpdateRequest,
    FalseSafeReviewRequest,
    RoleChangeRequest,
    RoleChangeResponse,
)
from ..models.schemas import (
    Activity,
    ActivityCreate,
    Announcement,
    AnnouncementCreate,
    AnnouncementsResponse,
    AnnouncementUpdate,
    CommunityReport,
    CommunityReportsResponse,
)
from ..services import (
    admin_operations,
    announcement_images,
    data_health,
    notifications,
    roles,
    supabase_client,
)
from ..services import community as community_service
from ..services.forecast_models import artifact_statuses

router = APIRouter()


@router.patch("/admin/profiles/{user_id}/role", response_model=RoleChangeResponse)
async def change_profile_role(
    user_id: str,
    body: RoleChangeRequest,
    user: AuthenticatedUser = Depends(require_admin),
):
    try:
        result = await run_in_threadpool(
            roles.change_user_role,
            target_user_id=user_id,
            new_role=body.role,
            actor_id=user.id,
            reason=body.reason,
        )
    except KeyError as exc:
        raise HTTPException(404, detail="profile_not_found") from exc
    except ValueError as exc:
        raise HTTPException(409, detail=str(exc)) from exc
    return RoleChangeResponse(**result)


@router.get("/admin/data-issues")
async def data_issues(
    limit: int = Query(100, ge=1, le=200),
    _user: AuthenticatedUser = Depends(require_moderator),
):
    rows = await run_in_threadpool(supabase_client.list_data_issues, limit)
    return {"issues": rows, "count": len(rows)}


@router.patch("/admin/data-issues/{issue_id}")
async def update_data_issue(
    issue_id: str,
    body: DataIssueUpdateRequest,
    user: AuthenticatedUser = Depends(require_moderator),
):
    try:
        return await run_in_threadpool(
            admin_operations.transition_data_issue,
            issue_id=issue_id,
            status=body.status,
            reason=body.reason,
            expected_updated_at=body.expected_updated_at,
            actor_id=user.id,
        )
    except KeyError as exc:
        raise HTTPException(404, detail="data_issue_not_found") from exc
    except admin_operations.StaleRecordError as exc:
        raise HTTPException(409, detail="data_issue_stale") from exc
    except ValueError as exc:
        raise HTTPException(409, detail=str(exc)) from exc


@router.get("/admin/audit-logs")
async def audit_logs(
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0, le=100_000),
    action: str | None = Query(default=None, max_length=100),
    entity_type: str | None = Query(default=None, max_length=100),
    _user: AuthenticatedUser = Depends(require_admin),
):
    rows = await run_in_threadpool(
        supabase_client.list_audit_logs, limit, offset, action, entity_type
    )
    return {
        "logs": rows,
        "count": len(rows),
        "limit": limit,
        "offset": offset,
        "has_more": len(rows) == limit,
    }


@router.get("/admin/audit-logs/export")
async def export_audit_logs(
    limit: int = Query(1000, ge=1, le=5000),
    action: str | None = Query(default=None, max_length=100),
    entity_type: str | None = Query(default=None, max_length=100),
    _user: AuthenticatedUser = Depends(require_admin),
):
    rows = await run_in_threadpool(
        supabase_client.list_audit_logs, limit, 0, action, entity_type
    )
    output = io.StringIO(newline="")
    writer = csv.writer(output)
    writer.writerow(
        [
            "id",
            "created_at",
            "actor_id",
            "action",
            "entity_type",
            "entity_id",
            "details",
        ]
    )
    for row in rows:
        writer.writerow(
            [
                row.get("id"),
                row.get("created_at"),
                row.get("actor_id"),
                row.get("action"),
                row.get("entity_type"),
                row.get("entity_id"),
                json.dumps(
                    row.get("details") or {}, ensure_ascii=False, sort_keys=True
                ),
            ]
        )
    return Response(
        content=output.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": "attachment; filename=clearpath-audit-logs.csv"
        },
    )


@router.get("/admin/reports", response_model=CommunityReportsResponse)
async def report_log(
    limit: int = Query(100, ge=1, le=200),
    _user: AuthenticatedUser = Depends(require_moderator),
):
    rows = await run_in_threadpool(community_service.list_reports, "all", limit)
    return CommunityReportsResponse(
        reports=[CommunityReport(**r) for r in rows], count=len(rows)
    )


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
            "details": {
                "before": None,
                "after": {
                    "title": row.get("title"),
                    "status": row.get("status"),
                    "updated_at": row.get("updated_at"),
                },
                "reason": "สร้างประกาศจากศูนย์ผู้ดูแล",
            },
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
    reason = str(values.pop("reason", "") or "แก้ไขประกาศจากศูนย์ผู้ดูแล")
    expected_updated_at = values.pop("expected_updated_at", None)
    before = await run_in_threadpool(supabase_client.get_announcement, announcement_id)
    if not before:
        raise HTTPException(404, detail="ไม่พบประกาศ")
    if "status" in values:
        values["published"] = values["status"] == "published"
        if values["status"] == "published" and before.get("status") != "published":
            values["published_at"] = datetime.now(UTC).isoformat()
    values.update({"updated_by": user.id, "updated_at": datetime.now(UTC).isoformat()})
    try:
        row = await run_in_threadpool(
            supabase_client.update_announcement,
            announcement_id,
            values,
            expected_updated_at,
        )
    except KeyError as exc:
        raise HTTPException(404, detail="ไม่พบประกาศ") from exc
    except ValueError as exc:
        raise HTTPException(409, detail="announcement_stale") from exc
    await run_in_threadpool(
        supabase_client.create_audit_log,
        {
            "actor_id": user.id,
            "action": "announcement_updated",
            "entity_type": "announcement",
            "entity_id": announcement_id,
            "details": {
                "before": {
                    "title": before.get("title"),
                    "status": before.get("status"),
                    "updated_at": before.get("updated_at"),
                },
                "after": {
                    "title": row.get("title"),
                    "status": row.get("status"),
                    "updated_at": row.get("updated_at"),
                },
                "reason": reason,
            },
        },
    )
    if values.get("status") == "published" and before.get("status") != "published":
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
    before = await run_in_threadpool(supabase_client.get_announcement, announcement_id)
    if not before:
        raise HTTPException(404, detail="ไม่พบประกาศ")
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
            "details": {
                "before": {
                    "title": before.get("title"),
                    "status": before.get("status"),
                    "updated_at": before.get("updated_at"),
                },
                "after": {
                    "title": row.get("title"),
                    "status": row.get("status"),
                    "updated_at": row.get("updated_at"),
                },
                "reason": "เก็บประกาศออกจากรายการใช้งาน",
            },
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
    try:
        content = await run_in_threadpool(
            announcement_images.sanitize_public_image, content, content_type
        )
    except ValueError as exc:
        raise HTTPException(422, detail="ไฟล์ภาพไม่ถูกต้องหรือชนิดไฟล์ไม่ตรง") from exc
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
    user: AuthenticatedUser = Depends(require_admin),
):
    row = await run_in_threadpool(
        supabase_client.create_activity,
        {"id": str(uuid4()), **body.model_dump(), "active": True},
    )
    await run_in_threadpool(
        supabase_client.create_audit_log,
        {
            "actor_id": user.id,
            "action": "activity_created",
            "entity_type": "activity",
            "entity_id": str(row["id"]),
            "details": {
                "before": None,
                "after": {
                    "title": row.get("title"),
                    "active": row.get("active"),
                    "reward_points": row.get("reward_points"),
                },
                "reason": "สร้างกิจกรรมจากศูนย์ผู้ดูแล",
            },
        },
    )
    return Activity(**row)


@router.get("/admin/sync-runs")
async def sync_runs(
    limit: int = Query(50, ge=1, le=200),
    _user: AuthenticatedUser = Depends(require_moderator),
):
    rows = await run_in_threadpool(supabase_client.list_sync_runs, limit)
    return {"runs": rows, "count": len(rows)}


@router.get("/admin/data-health", response_model=DataHealthResponse)
async def data_health_summary(
    _user: AuthenticatedUser = Depends(require_moderator),
):
    summary = await run_in_threadpool(data_health.get_data_health)
    return DataHealthResponse(**summary)


@router.get("/admin/forecast-models")
async def forecast_models(
    _user: AuthenticatedUser = Depends(require_moderator),
):
    models = await run_in_threadpool(artifact_statuses)
    return {"models": models, "count": len(models)}


@router.get("/admin/forecast-data-quality")
async def forecast_data_quality(
    days: int = Query(7, ge=1, le=31),
    _user: AuthenticatedUser = Depends(require_admin),
):
    rows = await run_in_threadpool(
        supabase_client.get_forecast_data_quality_summary, days
    )
    return {"rows": rows, "count": len(rows), "days": days}


@router.get("/admin/forecast-provider-health")
async def forecast_provider_health(
    _user: AuthenticatedUser = Depends(require_admin),
):
    return await run_in_threadpool(supabase_client.forecast_provider_health)


@router.get("/admin/forecast-evaluation")
async def forecast_evaluation(
    days: int = Query(14, ge=1, le=90),
    _user: AuthenticatedUser = Depends(require_admin),
):
    rows = await run_in_threadpool(
        supabase_client.get_forecast_evaluation_summary, days
    )
    return {"rows": rows, "count": len(rows), "days": days}


@router.get("/admin/forecast-false-safe-cases")
async def forecast_false_safe_cases(
    days: int = Query(30, ge=1, le=90),
    limit: int = Query(100, ge=1, le=200),
    _user: AuthenticatedUser = Depends(require_admin),
):
    rows = await run_in_threadpool(
        supabase_client.list_forecast_false_safe_cases, days, limit
    )
    return {"cases": rows, "count": len(rows), "days": days}


@router.put(
    "/admin/forecast-false-safe-cases/{run_id}/{horizon_hours}/{variant}/review"
)
async def review_forecast_false_safe_case(
    run_id: str,
    horizon_hours: int,
    variant: str,
    body: FalseSafeReviewRequest,
    user: AuthenticatedUser = Depends(require_admin),
):
    if horizon_hours not in {1, 3, 6, 12, 24}:
        raise HTTPException(400, detail="ช่วงเวลาพยากรณ์ไม่ถูกต้อง")
    if variant not in {"served", "shadow"}:
        raise HTTPException(400, detail="ชนิดผลพยากรณ์ไม่ถูกต้อง")
    now = datetime.now(UTC).isoformat()
    row = await run_in_threadpool(
        supabase_client.upsert_forecast_false_safe_review,
        {
            "run_id": run_id,
            "horizon_hours": horizon_hours,
            "variant": variant,
            **body.model_dump(),
            "reviewed_by": user.id,
            "reviewed_at": now,
            "updated_at": now,
        },
    )
    await run_in_threadpool(
        supabase_client.create_audit_log,
        {
            "actor_id": user.id,
            "action": "forecast_false_safe_reviewed",
            "entity_type": "forecast_prediction",
            "entity_id": f"{run_id}:{horizon_hours}:{variant}",
            "details": {"disposition": body.disposition},
        },
    )
    return row


@router.get("/admin/forecast-release-decisions")
async def forecast_release_decisions(
    limit: int = Query(100, ge=1, le=200),
    _user: AuthenticatedUser = Depends(require_admin),
):
    rows = await run_in_threadpool(
        supabase_client.list_forecast_release_decisions, limit
    )
    return {"decisions": rows, "count": len(rows)}


@router.get("/admin/notification-outbox")
async def notification_outbox(
    _user: AuthenticatedUser = Depends(require_moderator),
):
    return await run_in_threadpool(supabase_client.notification_outbox_summary)
