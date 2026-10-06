"""Search places in Thailand without exposing the provider key to browsers."""

from fastapi import APIRouter, Query, Response

from ..models.locations import LocationSearchResponse, LocationSuggestion
from ..services.places import search_places

router = APIRouter()


@router.get("/locations/search", response_model=LocationSearchResponse)
async def location_search(
    response: Response,
    q: str = Query(..., min_length=3, max_length=100),
    limit: int = Query(10, ge=1, le=20),
):
    locations, coverage = await search_places(q, limit)
    response.headers["Cache-Control"] = (
        "public, max-age=60, s-maxage=300"
        if coverage == "nationwide"
        else "public, max-age=15, s-maxage=30"
    )
    return LocationSearchResponse(
        locations=[LocationSuggestion(**row) for row in locations],
        coverage=coverage,
    )
