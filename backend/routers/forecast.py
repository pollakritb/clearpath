"""Public station forecast and bounded viewport-surface endpoints."""

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query
from starlette.concurrency import run_in_threadpool

from ..algorithms.distance import haversine_km
from ..models.schemas import ForecastResponse, ForecastSurfaceResponse
from ..services import forecasting

router = APIRouter()


@router.get("/forecast", response_model=ForecastResponse)
async def forecast(
    background_tasks: BackgroundTasks,
    station_id: str = Query(...),
    hours: int = Query(12, ge=1, le=24),
):
    try:
        response, ledger = await run_in_threadpool(
            forecasting.station_forecast, station_id, hours
        )
    except ValueError as exc:
        raise HTTPException(422, detail=str(exc)) from exc
    background_tasks.add_task(forecasting.persist_ledger, ledger)
    return ForecastResponse(**response)


@router.get("/forecast/surface", response_model=ForecastSurfaceResponse)
async def surface(
    background_tasks: BackgroundTasks,
    horizon: int = Query(12),
    grid_size: int = Query(12, ge=4, le=30),
    min_lat: float | None = Query(default=None, ge=-90, le=90),
    max_lat: float | None = Query(default=None, ge=-90, le=90),
    min_lon: float | None = Query(default=None, ge=-180, le=180),
    max_lon: float | None = Query(default=None, ge=-180, le=180),
):
    supplied = [min_lat, max_lat, min_lon, max_lon]
    if any(value is not None for value in supplied) and not all(
        value is not None for value in supplied
    ):
        raise HTTPException(422, detail="surface_bounds_incomplete")
    bounds = None
    if all(value is not None for value in supplied):
        assert min_lat is not None and max_lat is not None
        assert min_lon is not None and max_lon is not None
        if min_lat >= max_lat or min_lon >= max_lon:
            raise HTTPException(422, detail="surface_bounds_invalid")
        if haversine_km(min_lat, min_lon, max_lat, max_lon) > 500:
            raise HTTPException(422, detail="surface_bounds_exceed_500km")
        bounds = {
            "min_lat": min_lat,
            "max_lat": max_lat,
            "min_lon": min_lon,
            "max_lon": max_lon,
        }
    try:
        response, ledgers = await run_in_threadpool(
            forecasting.surface_forecast, horizon, grid_size, bounds
        )
    except ValueError as exc:
        raise HTTPException(422, detail=str(exc)) from exc
    for ledger in ledgers:
        background_tasks.add_task(forecasting.persist_ledger, ledger)
    return ForecastSurfaceResponse(**response)
