"""Read-only admin dashboard APIs protected by Supabase roles."""

import csv
import io
import json

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from starlette.concurrency import run_in_threadpool

from ..algorithms.page_cursor import decode_audit_cursor, encode_audit_cursor
from ..core.auth import AuthenticatedUser, require_admin, require_moderator
from ..models.admin import (
    DataHealthResponse,
)
from ..models.community_trust import CommunityTrustReviews
from ..models.schemas import (
    Announcement,
    AnnouncementsResponse,
    CommunityReport,
    CommunityReportsResponse,
)
from ..services import community as community_service
from ..services import (
    data_health,
    forecast_status,
    supabase_client,
)

router = APIRouter()


@router.get("/admin/data-issues")
async def data_issues(
    limit: int = Query(100, ge=1, le=200),
    _user: AuthenticatedUser = Depends(require_moderator),
):
    rows = await run_in_threadpool(supabase_client.list_data_issues, limit)
    return {"issues": rows, "count": len(rows)}


@router.get("/admin/audit-logs")
async def audit_logs(
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0, le=100_000),
    cursor: str | None = Query(default=None, max_length=1024),
    action: str | None = Query(default=None, max_length=100),
    entity_type: str | None = Query(default=None, max_length=100),
    _user: AuthenticatedUser = Depends(require_admin),
):
    try:
        decoded = decode_audit_cursor(cursor, action, entity_type) if cursor else None
    except ValueError as exc:
        raise HTTPException(422, detail="audit_cursor_invalid") from exc
    if cursor and offset:
        raise HTTPException(422, detail="audit_cursor_offset_conflict")
    if offset:
        # Compatibility only; new clients always use the cursor path.
        rows = await run_in_threadpool(
            supabase_client.list_audit_logs, limit + 1, offset, action, entity_type
        )
    else:
        rows = await run_in_threadpool(
            supabase_client.list_audit_logs_after,
            limit + 1,
            decoded,
            action,
            entity_type,
        )
    more = len(rows) > limit
    rows = rows[:limit]
    return {
        "logs": rows,
        "count": len(rows),
        "limit": limit,
        "offset": offset,
        "has_more": more,
        "next_cursor": encode_audit_cursor(rows[-1], action, entity_type)
        if more and rows
        else None,
    }


@router.get("/admin/audit-logs/export")
async def export_audit_logs(
    limit: int = Query(1000, ge=1, le=5000),
    action: str | None = Query(default=None, max_length=100),
    entity_type: str | None = Query(default=None, max_length=100),
    _user: AuthenticatedUser = Depends(require_admin),
):
    rows = []
    cursor = None
    while len(rows) < limit:
        size = min(500, limit - len(rows))
        page = await run_in_threadpool(
            supabase_client.list_audit_logs_after, size, cursor, action, entity_type
        )
        rows.extend(page)
        if len(page) < size:
            break
        cursor = decode_audit_cursor(
            encode_audit_cursor(page[-1], action, entity_type), action, entity_type
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


@router.get("/admin/announcements", response_model=AnnouncementsResponse)
async def admin_announcements(
    limit: int = Query(100, ge=1, le=200),
    _user: AuthenticatedUser = Depends(require_admin),
):
    rows = await run_in_threadpool(supabase_client.list_admin_announcements, limit)
    return AnnouncementsResponse(announcements=[Announcement(**row) for row in rows])


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
    return forecast_status.retired_items("models")


@router.get("/admin/forecast-data-quality")
async def forecast_data_quality(
    days: int = Query(7, ge=1, le=31),
    _user: AuthenticatedUser = Depends(require_admin),
):
    return forecast_status.retired_items("rows", days=days)


@router.get("/admin/forecast-provider-health")
async def forecast_provider_health(
    _user: AuthenticatedUser = Depends(require_admin),
):
    from ..core.config import settings

    if settings.cams_grid_forecast_enabled:
        from ..services import forecast_grid

        return {
            "source": "cams_grid",
            "grid": await run_in_threadpool(forecast_grid.metadata),
        }
    return await run_in_threadpool(supabase_client.forecast_provider_health)


@router.get("/admin/forecast-evaluation")
async def forecast_evaluation(
    days: int = Query(14, ge=1, le=90),
    _user: AuthenticatedUser = Depends(require_admin),
):
    return forecast_status.retired_items("rows", days=days)


@router.get("/admin/forecast-false-safe-cases")
async def forecast_false_safe_cases(
    days: int = Query(30, ge=1, le=90),
    limit: int = Query(100, ge=1, le=200),
    _user: AuthenticatedUser = Depends(require_admin),
):
    return forecast_status.retired_items("cases", days=days)


@router.get("/admin/forecast-release-decisions")
async def forecast_release_decisions(
    limit: int = Query(100, ge=1, le=200),
    _user: AuthenticatedUser = Depends(require_admin),
):
    return forecast_status.retired_items("decisions")


@router.get("/admin/notification-outbox")
async def notification_outbox(
    _user: AuthenticatedUser = Depends(require_moderator),
):
    return await run_in_threadpool(supabase_client.notification_outbox_summary)


@router.get("/admin/community-trust/reviews", response_model=CommunityTrustReviews)
async def community_trust_reviews(
    limit: int = Query(50, ge=1, le=100),
    _user: AuthenticatedUser = Depends(require_admin),
):
    from ..services.community.community_trust import review_queue

    return await run_in_threadpool(review_queue, limit)
