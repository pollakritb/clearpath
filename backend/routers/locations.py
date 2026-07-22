"""Privacy-safe location search using only the bundled Nakhon Pathom gazetteer."""

from fastapi import APIRouter, Query

from ..models.locations import LocationSearchResponse, LocationSuggestion
from ..services.gazetteer import search_locations

router = APIRouter()


@router.get("/locations/search", response_model=LocationSearchResponse)
def location_search(
    q: str = Query(..., min_length=2, max_length=100),
    limit: int = Query(10, ge=1, le=20),
):
    return LocationSearchResponse(
        locations=[LocationSuggestion(**row) for row in search_locations(q, limit)]
    )
