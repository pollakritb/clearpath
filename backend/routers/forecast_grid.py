"""Bounded, generation-pinned forecast grid reads."""

from datetime import datetime, timedelta
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Response

from ..models.forecast_grid import ForecastGridFrames, ForecastGridMetadata
from ..services import forecast_grid

router = APIRouter(prefix="/forecast-grid")


@router.get("/metadata", response_model=ForecastGridMetadata)
def metadata(response: Response):
    response.headers["Cache-Control"] = "no-store"
    return forecast_grid.metadata()


@router.get("/frames", response_model=ForecastGridFrames)
def frames(
    response: Response,
    generation_id: UUID,
    start: datetime,
    end: datetime,
    min_lat: Annotated[float, Query(ge=5, le=21)],
    max_lat: Annotated[float, Query(ge=5, le=21)],
    min_lon: Annotated[float, Query(ge=97, le=106)],
    max_lon: Annotated[float, Query(ge=97, le=106)],
):
    if (
        start.tzinfo is None
        or end.tzinfo is None
        or start > end
        or end - start > timedelta(hours=5)
    ):
        raise HTTPException(422, "forecast_grid_time_range_invalid")
    if min_lat >= max_lat or min_lon >= max_lon:
        raise HTTPException(422, "forecast_grid_bounds_invalid")
    try:
        result = forecast_grid.frames(
            str(generation_id), start, end, (min_lat, min_lon, max_lat, max_lon)
        )
    except LookupError as exc:
        raise HTTPException(410, "forecast_grid_generation_unavailable") from exc
    response.headers["Cache-Control"] = "public, max-age=300, s-maxage=3600"
    return result
