"""Search places in Thailand without exposing the provider key to browsers."""

from typing import Annotated

from fastapi import APIRouter, Query, Response

from ..models.locations import (
    LocationLabelResponse,
    LocationSearchResponse,
    LocationSuggestion,
)
from ..services.place_labels import resolve_label
from ..services.places import search_places

router = APIRouter()


@router.get("/locations/reverse", response_model=LocationLabelResponse)
async def location_label(
    response: Response,
    lat: Annotated[float, Query(ge=5, le=21)],
    lon: Annotated[float, Query(ge=97, le=106)],
):
    response.headers["Cache-Control"] = "private, no-store"
    return await resolve_label(lat, lon)


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
