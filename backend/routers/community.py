"""Community API — reports, community reactions, news and leaderboard."""

from datetime import UTC, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import Response
from starlette.concurrency import run_in_threadpool

from ..core.auth import AuthenticatedUser, require_user
from ..core.config import settings
from ..core.errors import ReportInProgressError
from ..core.identifiers import ReportID, RequestID
from ..models.schemas import (
    AccountAccessResponse,
    ActivitiesResponse,
    Activity,
    Announcement,
    AnnouncementsResponse,
    CaptureSessionResponse,
    CommunityMapPoint,
    CommunityMapPointsResponse,
    CommunityProfileResponse,
    CommunityReport,
    CommunityReportsResponse,
    CommunityReportStack,
    OperationResponse,
    PhotoMetadata,
    PlaceReportSelection,
    ReportComment,
    ReportCommentCreate,
    ReportCreateResponse,
    ReportDraftResponse,
    ReportDraftSubmit,
    ReportEngagementResponse,
    ReportReactionRequest,
)
from ..models.xp import XPLeaderboard
from ..services import capture as capture_service
from ..services import community as community_service
from ..services import (
    google_news,
    local_store,
    photo_metadata,
    supabase_client,
)
from ..services.community import evidence
from ..services.community.evidence import MAX_IMAGE_BYTES

router = APIRouter()


@router.post("/community/capture-session", response_model=CaptureSessionResponse)
async def capture_session(user: AuthenticatedUser = Depends(require_user)):
    """Issue a short-lived, account-bound timestamp before opening the camera."""
    allowed = await run_in_threadpool(
        supabase_client.take_rate_limit, user.id, "capture_session", 60, 12
    )
    if not allowed:
        raise HTTPException(429, detail="เปิดกล้องถี่เกินไป กรุณารอสักครู่")
    await run_in_threadpool(supabase_client.ensure_profile, user.id)
    return CaptureSessionResponse(**capture_service.issue_session(user.id))


@router.get("/community/local-images/{image_path:path}", include_in_schema=False)
async def local_image(image_path: str, token: str = Query(...)):
    if not settings.local_demo_mode:
        raise HTTPException(404, detail="not found")
    result = local_store.get_image(image_path, token)
    if not result:
        raise HTTPException(404, detail="ไม่พบภาพหรือ token ไม่ถูกต้อง")
    content, content_type = result
    return Response(content=content, media_type=content_type)


@router.get("/community/reports", response_model=CommunityReportsResponse)
async def reports(limit: int = Query(200, ge=1, le=500)):
    from ..core.errors import UpstreamError
    from ..services.community import xp

    try:
        state = await run_in_threadpool(xp.control)
    except UpstreamError:
        state = {"reset_version": None}
    rows, stacks = await run_in_threadpool(
        community_service.list_public_map_reports, limit
    )
    return CommunityReportsResponse(
        reset_version=state["reset_version"],
        reports=[CommunityReport(**r) for r in rows],
        count=len(rows),
        stacks=[CommunityReportStack(**stack) for stack in stacks],
    )


@router.get("/community/reports/{report_id}", response_model=CommunityReport)
async def published_report(
    report_id: ReportID,
    response: Response,
    request_id: RequestID | None = None,
    user: AuthenticatedUser = Depends(require_user),
):
    from ..services.community.details import published_report as resolve

    response.headers["Cache-Control"] = "no-store"
    try:
        return await run_in_threadpool(
            resolve, str(report_id), user.id, user.role, request_id
        )
    except KeyError:
        raise HTTPException(404, detail="ไม่พบรายงานที่เผยแพร่แล้ว") from None


@router.get("/community/map-points", response_model=CommunityMapPointsResponse)
async def community_map_points():
    points = await run_in_threadpool(community_service.list_map_points)
    return CommunityMapPointsResponse(
        points=[CommunityMapPoint(**point) for point in points], count=len(points)
    )


@router.get("/community/review-queue", response_model=CommunityReportsResponse)
async def review_queue(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    limit: int = Query(50, ge=1, le=100),
    user: AuthenticatedUser = Depends(require_user),
):
    rows = await run_in_threadpool(
        community_service.list_reviewable_reports, user.id, lat, lon, limit
    )
    return CommunityReportsResponse(
        reports=[CommunityReport(**r) for r in rows], count=len(rows)
    )


@router.post("/community/image-metadata", response_model=PhotoMetadata)
async def image_metadata(
    image: UploadFile = File(...), user: AuthenticatedUser = Depends(require_user)
):
    """Inspect only the caller's upload; do not store it or perform OCR."""
    allowed = await run_in_threadpool(
        supabase_client.take_rate_limit, user.id, "image_metadata", 60, 12
    )
    if not allowed:
        raise HTTPException(429, detail="เลือกภาพถี่เกินไป กรุณารอสักครู่")
    content = await image.read(MAX_IMAGE_BYTES + 1)
    if not content or len(content) > MAX_IMAGE_BYTES:
        raise HTTPException(413, detail="ภาพต้องมีขนาดไม่เกิน 4 MB")
    try:
        return await run_in_threadpool(photo_metadata.inspect_photo, content)
    except ValueError as exc:
        raise HTTPException(415, detail=str(exc)) from exc


@router.post(
    "/community/report-drafts", response_model=ReportDraftResponse, status_code=201
)
async def create_report_draft(
    lat: float = Form(..., ge=-90, le=90),
    lon: float = Form(..., ge=-180, le=180),
    gps_accuracy_m: float = Form(..., ge=0, le=200),
    submission_lat: float | None = Form(default=None, ge=-90, le=90),
    submission_lon: float | None = Form(default=None, ge=-180, le=180),
    camera_session_token: str = Form(..., min_length=20),
    client_captured_at: str | None = Form(default=None),
    capture_source: Literal["camera", "gallery"] = Form(default="camera"),
    client_timezone_offset_minutes: int | None = Form(default=None, ge=-840, le=840),
    file_last_modified_at: str | None = Form(default=None, max_length=40),
    file_selected_at: str | None = Form(default=None, max_length=40),
    image: UploadFile = File(...),
    burst_images: list[UploadFile] = File(default=[]),
    user: AuthenticatedUser = Depends(require_user),
):
    """Upload fresh camera evidence and return advisory OCR before final submit."""
    try:
        content, content_type = await evidence.read_upload(image)
        if len(burst_images) > 2:
            raise HTTPException(400, detail="รองรับภาพเสริมไม่เกิน 2 เฟรม")
        burst = [
            await evidence.read_upload(upload, supplementary=True)
            for upload in burst_images
        ]
        if len(content) + sum(len(data) for data, _mime in burst) > MAX_IMAGE_BYTES:
            raise HTTPException(413, detail="ภาพที่ส่งรวมกันต้องไม่เกิน 4 MB กรุณาลดภาพเสริม")
    except evidence.InvalidImageUpload as exc:
        raise HTTPException(exc.status_code, detail=str(exc)) from exc
    try:
        allowed = await run_in_threadpool(
            supabase_client.take_rate_limit, user.id, "report_draft", 60, 12
        )
        if not allowed:
            raise HTTPException(429, detail="ส่งภาพถี่เกินไป กรุณารอสักครู่")
        draft = await community_service.create_draft(
            user_id=user.id,
            lat=lat,
            lon=lon,
            gps_accuracy_m=gps_accuracy_m,
            submission_lat=submission_lat,
            submission_lon=submission_lon,
            camera_session_token=camera_session_token,
            client_captured_at=client_captured_at,
            capture_source=capture_source,
            client_timezone_offset_minutes=client_timezone_offset_minutes,
            file_last_modified_at=file_last_modified_at,
            file_selected_at=file_selected_at,
            image=content,
            content_type=content_type,
            original_filename=(image.filename or "")[:200],
            burst_images=burst,
        )
    except ValueError as exc:
        raise HTTPException(400, detail=str(exc)) from exc
    return ReportDraftResponse(**draft)


@router.post(
    "/community/report-drafts/{draft_id}/submit",
    response_model=ReportCreateResponse,
    status_code=201,
)
async def submit_report_draft(
    draft_id: str,
    body: ReportDraftSubmit,
    user: AuthenticatedUser = Depends(require_user),
):
    try:
        report = await community_service.submit_draft(
            draft_id=draft_id,
            user_id=user.id,
            values=body.model_dump()
            | {
                "_context_explicit": {
                    "measurement_environment",
                    "averaging_period",
                }.issubset(body.model_fields_set)
            },
            reporter_identity={
                "display_name": user.display_name,
                "avatar_url": user.avatar_url,
                "identity_provider": user.identity_provider,
            },
        )
    except ReportInProgressError as exc:
        raise HTTPException(409, detail=str(exc), headers={"Retry-After": "2"}) from exc
    except KeyError as exc:
        raise HTTPException(404, detail="ไม่พบ draft") from exc
    except ValueError as exc:
        raise HTTPException(400, detail=str(exc)) from exc
    from ..services.community import xp

    reward = await run_in_threadpool(xp.result_for_report, str(report["id"]), user.id)
    review_outcome = report.get("_review_outcome", "automatic_rejected")
    return ReportCreateResponse(
        xp=reward,
        report=CommunityReport(**report),
        ocr_available=report.get("ocr_pm25") is not None,
        review_outcome=review_outcome,
        review_reasons=report.get("_review_reasons") or [],
        message=(
            "ระบบตรวจหลักฐานและอนุมัติรายงานอัตโนมัติแล้ว"
            if review_outcome == "automatic_approved"
            else "รายงานไม่ผ่านเกณฑ์อัตโนมัติ กรุณาดูเหตุผลและถ่ายภาพใหม่"
        ),
    )


@router.delete("/community/report-drafts/{draft_id}", response_model=OperationResponse)
async def delete_report_draft(
    draft_id: str, user: AuthenticatedUser = Depends(require_user)
):
    deleted = await run_in_threadpool(
        community_service.discard_draft, draft_id, user.id
    )
    if not deleted:
        raise HTTPException(404, detail="ไม่พบ draft")
    return OperationResponse(ok=True, message="ลบ draft แล้ว")


@router.get(
    "/community/reports/{report_id}/engagement",
    response_model=ReportEngagementResponse,
)
async def report_engagement(report_id: str):
    try:
        result = await run_in_threadpool(
            community_service.get_engagement, report_id, None
        )
    except KeyError as exc:
        raise HTTPException(404, detail="ไม่พบรายงาน") from exc
    except ValueError as exc:
        raise HTTPException(400, detail=str(exc)) from exc
    return ReportEngagementResponse(**result)


@router.get(
    "/community/reports/{report_id}/engagement/me",
    response_model=ReportEngagementResponse,
)
async def my_report_engagement(
    report_id: str, user: AuthenticatedUser = Depends(require_user)
):
    try:
        result = await run_in_threadpool(
            community_service.get_engagement, report_id, user.id
        )
    except KeyError as exc:
        raise HTTPException(404, detail="ไม่พบรายงาน") from exc
    except ValueError as exc:
        raise HTTPException(400, detail=str(exc)) from exc
    return ReportEngagementResponse(**result)


@router.put(
    "/community/reports/{report_id}/reaction",
    response_model=ReportEngagementResponse,
)
async def set_report_reaction(
    report_id: str,
    body: ReportReactionRequest,
    user: AuthenticatedUser = Depends(require_user),
):
    allowed = await run_in_threadpool(
        supabase_client.take_rate_limit, user.id, "report_reaction", 60, 30
    )
    if not allowed:
        raise HTTPException(429, detail="กดปฏิกิริยาถี่เกินไป กรุณารอสักครู่")
    try:
        result = await run_in_threadpool(
            community_service.set_reaction,
            report_id,
            user.id,
            body.reaction,
            body.location.model_dump() if body.location else None,
            body.reason_code,
            body.request_key,
            body.trust_policy_version,
        )
    except KeyError as exc:
        raise HTTPException(404, detail="ไม่พบรายงาน") from exc
    except ValueError as exc:
        raise HTTPException(400, detail=str(exc)) from exc
    return ReportEngagementResponse(**result)


@router.delete(
    "/community/reports/{report_id}/reaction",
    response_model=ReportEngagementResponse,
)
async def clear_report_reaction(
    report_id: str,
    request_key: str | None = None,
    user: AuthenticatedUser = Depends(require_user),
):
    try:
        result = await run_in_threadpool(
            community_service.clear_reaction, report_id, user.id, request_key
        )
    except KeyError as exc:
        raise HTTPException(404, detail="ไม่พบรายงาน") from exc
    except ValueError as exc:
        raise HTTPException(400, detail=str(exc)) from exc
    return ReportEngagementResponse(**result)


@router.post(
    "/community/reports/{report_id}/comments",
    response_model=ReportComment,
    status_code=201,
)
async def add_report_comment(
    report_id: str,
    body: ReportCommentCreate,
    user: AuthenticatedUser = Depends(require_user),
):
    allowed = await run_in_threadpool(
        supabase_client.take_rate_limit, user.id, "report_comment", 3600, 20
    )
    if not allowed:
        raise HTTPException(429, detail="ส่งความคิดเห็นถี่เกินไป กรุณารอรอบถัดไป")
    try:
        result = await run_in_threadpool(
            community_service.add_comment,
            report_id,
            user.id,
            body.body,
            user.display_name,
        )
    except KeyError as exc:
        raise HTTPException(404, detail="ไม่พบรายงาน") from exc
    except ValueError as exc:
        raise HTTPException(400, detail=str(exc)) from exc
    return ReportComment(**result)


@router.delete(
    "/community/reports/{report_id}/comments/{comment_id}",
    response_model=OperationResponse,
)
async def remove_report_comment(
    report_id: str,
    comment_id: str,
    user: AuthenticatedUser = Depends(require_user),
):
    try:
        await run_in_threadpool(community_service.get_engagement, report_id, user.id, 1)
    except KeyError as exc:
        raise HTTPException(404, detail="ไม่พบรายงาน") from exc
    deleted = await run_in_threadpool(
        community_service.remove_comment, comment_id, user.id
    )
    if not deleted:
        raise HTTPException(404, detail="ไม่พบความคิดเห็นของคุณ")
    return OperationResponse(ok=True, message="ลบความคิดเห็นแล้ว")


@router.get("/community/me/access", response_model=AccountAccessResponse)
def account_access(user: AuthenticatedUser = Depends(require_user)):
    """Read the verified server role without loading report history or XP."""
    return AccountAccessResponse(role=user.role)


@router.get("/community/me", response_model=CommunityProfileResponse)
async def my_profile(user: AuthenticatedUser = Depends(require_user)):
    profile = await run_in_threadpool(supabase_client.get_profile, user.id)
    weekly_points = await run_in_threadpool(
        supabase_client.get_user_weekly_points, user.id
    )
    rows = await run_in_threadpool(supabase_client.list_user_reports, user.id, 50)
    from ..services.community import xp

    participation = await run_in_threadpool(xp.summary, user.id)
    return CommunityProfileResponse(
        xp=participation,
        user_id=user.id,
        display_name=profile.get("display_name"),
        reputation_score=int(profile.get("reputation_score") or 0),
        approved_reports=int(profile.get("approved_reports") or 0),
        helpful_reviews=int(profile.get("helpful_reviews") or 0),
        weekly_points=weekly_points,
        role=user.role,
        badges=participation["achievements"] if participation else [],
        created_at=profile.get("created_at"),
        reports=[CommunityReport(**row) for row in rows],
    )


@router.get("/community/leaderboard", response_model=XPLeaderboard)
def leaderboard(
    period: str | None = Query(
        None, pattern=r"^(all|7d|30d|month|[0-9]{4}-(0[1-9]|1[0-2]))$"
    ),
    offset: int = Query(0, ge=0, le=100000),
):
    from ..services.community import xp

    try:
        return XPLeaderboard(**xp.board(period, offset))
    except ValueError as exc:
        raise HTTPException(422, detail="เดือนอันดับไม่ถูกต้อง") from exc


@router.get("/community/announcements", response_model=AnnouncementsResponse)
async def announcements(
    response: Response,
    offset: int = Query(0, ge=0, le=10000),
    limit: int = Query(10, ge=1, le=100),
):
    from ..core.errors import UpstreamError
    from ..services import store_feeds

    rows = await run_in_threadpool(supabase_client.get_announcements)
    checked_at = None
    sync_status = "unknown"
    if settings.external_feed_storage_enabled and not settings.local_demo_mode:
        try:
            stored = await run_in_threadpool(store_feeds.news, offset + limit + 1)
            state = await run_in_threadpool(store_feeds.state, "google_news")
        except Exception as exc:
            raise UpstreamError("โหลดข่าวที่จัดเก็บไว้ไม่สำเร็จ") from exc
        external_rows = (
            [google_news.present_stored(row) for row in stored]
            if settings.google_news_enabled
            else []
        )
        checked_at = state.get("last_success_at")
        sync_status = (
            "failed"
            if state.get("last_error")
            else "ready"
            if checked_at
            else "pending"
        )
        if checked_at and datetime.now(UTC) - datetime.fromisoformat(
            str(checked_at).replace("Z", "+00:00")
        ) >= timedelta(hours=3):
            sync_status = "stale"
    else:
        external_rows = await google_news.fetch_latest()
    combined = [*rows, *external_rows]
    combined.sort(
        key=lambda row: (str(row.get("published_at") or ""), str(row["id"])),
        reverse=True,
    )
    page = combined[offset : offset + limit]
    has_more = len(combined) > offset + limit
    response.headers["Cache-Control"] = "public, s-maxage=60, stale-while-revalidate=60"
    return AnnouncementsResponse(
        announcements=[Announcement(**row) for row in page],
        checked_at=checked_at,
        sync_status=sync_status,
        has_more=has_more,
        next_offset=offset + len(page) if has_more else None,
    )


@router.get("/community/activities", response_model=ActivitiesResponse)
async def activities():
    rows = await run_in_threadpool(supabase_client.get_activities)
    return ActivitiesResponse(activities=[Activity(**r) for r in rows])


@router.get("/community/report-images/{report_id}")
def public_report_image(
    report_id: str, expires: int, signature: str = Query(max_length=64)
):
    from ..services.community import public_images
    from ..services.image_fingerprint import detect_image_mime

    try:
        content = public_images.read(report_id, expires, signature)
        mime = detect_image_mime(content)
    except (KeyError, ValueError) as exc:
        raise HTTPException(404, detail="ภาพหมดอายุหรือไม่พร้อมแสดง") from exc
    return Response(
        content,
        media_type=mime,
        headers={
            "Cache-Control": "private, max-age=300",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.get("/community/place-report-selection")
async def place_report_selection(
    response: Response,
    lat: float = Query(ge=-90, le=90),
    lon: float = Query(ge=-180, le=180),
    at: datetime | None = None,
) -> PlaceReportSelection:
    from ..services.community.place_reports import place_report_selection as select

    response.headers["Cache-Control"] = "no-store"
    now = datetime.now(UTC)
    target = at or now
    target = (
        target.replace(tzinfo=UTC) if target.tzinfo is None else target.astimezone(UTC)
    )
    if target > now + timedelta(minutes=5) or target < now - timedelta(
        hours=24, minutes=1
    ):
        raise HTTPException(422, detail="เลือกเวลาได้ภายใน 24 ชั่วโมงที่ผ่านมา")
    target = min(target, now)
    ids = await run_in_threadpool(select, lat, lon, target)
    return PlaceReportSelection(report_ids=ids, target_at=target.isoformat())
