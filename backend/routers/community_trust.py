"""Owner reads/review intake only; no Admin score or finding writes."""

from fastapi import APIRouter, Depends
from starlette.concurrency import run_in_threadpool

from ..core.auth import AuthenticatedUser, require_user
from ..models.community_trust import (
    CommunityTrust,
    CommunityTrustReview,
    CommunityTrustReviews,
)
from ..models.reporter_trust import ReporterReviewResult
from ..services.community import community_trust

router = APIRouter()


@router.get("/community/trust/me", response_model=CommunityTrust | None)
async def mine(user: AuthenticatedUser = Depends(require_user)):
    return await run_in_threadpool(community_trust.summary, user.id, owner=True)


@router.post("/community/trust/reviews", response_model=ReporterReviewResult)
async def review(
    body: CommunityTrustReview, user: AuthenticatedUser = Depends(require_user)
):
    return await run_in_threadpool(
        community_trust.request_review, user.id, body.model_dump(mode="json")
    )


@router.get("/community/trust/reviews", response_model=CommunityTrustReviews)
async def owner_reviews(user: AuthenticatedUser = Depends(require_user)):
    if not community_trust.settings.community_trust_collection_enabled:
        return {"requests": []}
    rows = await run_in_threadpool(
        community_trust.rpc, "community_trust_owner_reviews", {"p_user": user.id}
    )
    return {"requests": rows}
