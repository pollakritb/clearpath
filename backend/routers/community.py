"""Community API — ส่งรายงานภาพ, peer review, ข่าว, กิจกรรม และ leaderboard."""

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import Response
from starlette.concurrency import run_in_threadpool

from ..core.auth import AuthenticatedUser, require_user
from ..core.config import settings
from ..models.schemas import (
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
    LeaderboardResponse,
    OperationResponse,
    RatingResult,
    ReportCreateResponse,
    ReportDraftResponse,
    ReportDraftSubmit,
    ReportRatingRequest,
    UserReputation,
)
from ..services import capture as capture_service
from ..services import community as community_service
from ..services import local_store, supabase_client

router = APIRouter()
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_IMAGE_BYTES = 8 * 1024 * 1024


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
    rows = await run_in_threadpool(community_service.list_reports, "approved", limit)
    return CommunityReportsResponse(
        reports=[CommunityReport(**r) for r in rows], count=len(rows)
    )


@router.get("/community/map-points", response_model=CommunityMapPointsResponse)
async def community_map_points():
    from ..algorithms.community_quality import aggregate_community_reports

    reports = await run_in_threadpool(community_service.list_reports, "approved", 500)
    points = aggregate_community_reports(reports)
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


@router.post(
    "/community/report-drafts", response_model=ReportDraftResponse, status_code=201
)
async def create_report_draft(
    lat: float = Form(..., ge=-90, le=90),
    lon: float = Form(..., ge=-180, le=180),
    gps_accuracy_m: float = Form(..., ge=0, le=200),
    camera_session_token: str = Form(..., min_length=20),
    client_captured_at: str | None = Form(default=None),
    image: UploadFile = File(...),
    burst_images: list[UploadFile] = File(default=[]),
    user: AuthenticatedUser = Depends(require_user),
):
    """Upload fresh camera evidence and return advisory OCR before final submit."""
    content_type = image.content_type or ""
    if content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(415, detail="รองรับเฉพาะภาพ JPEG, PNG หรือ WEBP")
    content = await image.read(MAX_IMAGE_BYTES + 1)
    if not content:
        raise HTTPException(400, detail="ไฟล์ภาพว่าง")
    if len(content) > MAX_IMAGE_BYTES:
        raise HTTPException(413, detail="ภาพต้องมีขนาดไม่เกิน 8 MB")
    if len(burst_images) > 2:
        raise HTTPException(400, detail="รองรับภาพเสริมไม่เกิน 2 เฟรม")
    burst: list[tuple[bytes, str]] = []
    for upload in burst_images:
        burst_type = upload.content_type or ""
        burst_content = await upload.read(MAX_IMAGE_BYTES + 1)
        if burst_type not in ALLOWED_IMAGE_TYPES:
            raise HTTPException(415, detail="ภาพเสริมต้องเป็น JPEG, PNG หรือ WEBP")
        if not burst_content or len(burst_content) > MAX_IMAGE_BYTES:
            raise HTTPException(413, detail="ภาพเสริมแต่ละภาพต้องไม่เกิน 8 MB")
        burst.append((burst_content, burst_type))
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
            camera_session_token=camera_session_token,
            client_captured_at=client_captured_at,
            image=content,
            content_type=content_type,
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
        allowed = await run_in_threadpool(
            supabase_client.take_rate_limit, user.id, "community_report", 86400, 6
        )
        if not allowed:
            raise HTTPException(429, detail="ส่งรายงานได้ไม่เกิน 6 ครั้งต่อ 24 ชั่วโมง")
        report = await community_service.submit_draft(
            draft_id=draft_id, user_id=user.id, values=body.model_dump()
        )
    except KeyError as exc:
        raise HTTPException(404, detail="ไม่พบ draft") from exc
    except ValueError as exc:
        raise HTTPException(400, detail=str(exc)) from exc
    return ReportCreateResponse(
        report=CommunityReport(**report),
        ocr_available=report.get("ocr_pm25") is not None,
        message="ส่งรายงานแล้ว รอผู้ดูแลระบบตรวจสอบก่อนเผยแพร่",
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


@router.post("/community/reports/{report_id}/ratings", response_model=RatingResult)
async def rate_report(
    report_id: str,
    body: ReportRatingRequest,
    user: AuthenticatedUser = Depends(require_user),
):
    try:
        allowed = await run_in_threadpool(
            supabase_client.take_rate_limit, user.id, "community_rating", 3600, 30
        )
        if not allowed:
            raise HTTPException(429, detail="ให้คะแนนถี่เกินไป กรุณารอรอบถัดไป")
        result = await run_in_threadpool(
            community_service.rate_report,
            report_id,
            user.id,
            body.rating,
            body.note,
            body.reviewer_lat,
            body.reviewer_lon,
            body.gps_accuracy_m,
        )
    except KeyError as exc:
        raise HTTPException(404, detail="ไม่พบรายงาน") from exc
    except ValueError as exc:
        raise HTTPException(400, detail=str(exc)) from exc
    return RatingResult(**result)


@router.get("/community/me", response_model=CommunityProfileResponse)
async def my_profile(user: AuthenticatedUser = Depends(require_user)):
    profile = await run_in_threadpool(supabase_client.get_profile, user.id)
    weekly_points = await run_in_threadpool(
        supabase_client.get_user_weekly_points, user.id
    )
    rows = await run_in_threadpool(supabase_client.list_user_reports, user.id, 50)
    from ..algorithms.gamification import derive_badges

    return CommunityProfileResponse(
        user_id=user.id,
        display_name=profile.get("display_name"),
        reputation_score=int(profile.get("reputation_score") or 0),
        approved_reports=int(profile.get("approved_reports") or 0),
        helpful_reviews=int(profile.get("helpful_reviews") or 0),
        weekly_points=weekly_points,
        role=user.role,
        badges=derive_badges(
            reputation_score=int(profile.get("reputation_score") or 0),
            approved_reports=int(profile.get("approved_reports") or 0),
            helpful_reviews=int(profile.get("helpful_reviews") or 0),
        ),
        created_at=profile.get("created_at"),
        reports=[CommunityReport(**row) for row in rows],
    )


@router.get("/community/leaderboard", response_model=LeaderboardResponse)
async def leaderboard(limit: int = Query(20, ge=1, le=100)):
    rows = await run_in_threadpool(supabase_client.get_weekly_leaderboard, limit)
    from ..algorithms.gamification import derive_badges

    return LeaderboardResponse(
        users=[
            UserReputation(
                user_id=str(r["id"]),
                display_name=r.get("display_name"),
                reputation_score=int(r.get("reputation_score") or 0),
                approved_reports=int(r.get("approved_reports") or 0),
                helpful_reviews=int(r.get("helpful_reviews") or 0),
                weekly_points=int(r.get("weekly_points") or 0),
                badges=derive_badges(
                    reputation_score=int(r.get("reputation_score") or 0),
                    approved_reports=int(r.get("approved_reports") or 0),
                    helpful_reviews=int(r.get("helpful_reviews") or 0),
                ),
                role=str(r.get("role") or "user"),
            )
            for r in rows
        ]
    )


@router.get("/community/announcements", response_model=AnnouncementsResponse)
async def announcements():
    rows = await run_in_threadpool(supabase_client.get_announcements)
    return AnnouncementsResponse(announcements=[Announcement(**r) for r in rows])


@router.get("/community/activities", response_model=ActivitiesResponse)
async def activities():
    rows = await run_in_threadpool(supabase_client.get_activities)
    return ActivitiesResponse(activities=[Activity(**r) for r in rows])
