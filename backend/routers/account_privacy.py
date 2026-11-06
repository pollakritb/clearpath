"""Self-service account data, separate from read-only Administrator APIs."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response

from ..core.auth import AuthenticatedUser, require_recent_user, require_user
from ..models.account_privacy import (
    AccountExportPage,
    AccountPrivacyStatus,
    DeletionRequest,
    PrivacyRequest,
)
from ..services import account_privacy, supabase_client

router = APIRouter(prefix="/community/me")
User = Annotated[AuthenticatedUser, Depends(require_user)]
RecentUser = Annotated[AuthenticatedUser, Depends(require_recent_user)]


@router.get("/privacy", response_model=AccountPrivacyStatus)
def privacy_status(user: User, response: Response):
    response.headers["Cache-Control"] = "no-store"
    return {
        "enabled": account_privacy.enabled(),
        "requests": account_privacy.requests(user.id),
        "export_sections": list(account_privacy.SECTIONS),
    }


@router.get("/data-export", response_model=AccountExportPage)
def export_data(
    user: RecentUser,
    response: Response,
    section: str,
    offset: Annotated[int, Query(ge=0, le=1000000)] = 0,
):
    if section not in account_privacy.SECTIONS:
        raise HTTPException(422, "ประเภทข้อมูลไม่ถูกต้อง")
    if not supabase_client.take_rate_limit(user.id, "account_export", 600, 300):
        raise HTTPException(429, "ส่งออกข้อมูลถี่เกินไป กรุณารอแล้วลองใหม่")
    response.headers["Cache-Control"] = "no-store"
    return account_privacy.export_page(user.id, section, offset)


@router.post("/deletion-request", response_model=PrivacyRequest, status_code=202)
def deletion_request(body: DeletionRequest, user: RecentUser, response: Response):
    response.headers["Cache-Control"] = "no-store"
    return account_privacy.request_deletion(user.id)
