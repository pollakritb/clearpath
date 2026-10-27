"""Public station forecast and bounded viewport-surface endpoints."""

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query, Response
from starlette.concurrency import run_in_threadpool

from ..algorithms.distance import haversine_km
from ..core.config import settings
from ..models.schemas import (
    ForecastResponse,
    ForecastSurfaceResponse,
    ForecastValidationSummary,
)
from ..services import (
    external_forecast,
    forecast_status,
    forecast_validation,
    forecasting,
)

router = APIRouter()


@router.get("/forecast/validation-summary", response_model=ForecastValidationSummary)
async def validation_summary(station_id: str = Query(min_length=1, max_length=50)):
    if (
        settings.is_production
        or not settings.forecast_validation_public_metrics_enabled
    ):
        return ForecastValidationSummary(station_id=station_id)
    return ForecastValidationSummary(
        **await run_in_threadpool(
            forecast_validation.validated_station_summary, station_id
        )
    )


@router.get("/forecast", response_model=ForecastResponse)
async def forecast(
    background_tasks: BackgroundTasks,
    response: Response,
    station_id: str | None = Query(default=None),
    lat: float | None = Query(default=None, ge=-90, le=90),
    lon: float | None = Query(default=None, ge=-180, le=180),
    hours: int = Query(120, ge=1, le=120),
):
    has_area = lat is not None or lon is not None
    if bool(station_id) == has_area or (has_area and (lat is None or lon is None)):
        raise HTTPException(422, detail="forecast_target_invalid")
    if has_area and not (5 <= lat <= 21 and 97 <= lon <= 106):
        raise HTTPException(422, detail="forecast_area_outside_thailand")
    if settings.external_forecast_enabled:
        response.headers["Cache-Control"] = "no-store, max-age=0"
        try:
            result = (
                await external_forecast.station_forecast(station_id, hours)
                if station_id
                else await external_forecast.area_forecast(lat, lon, hours)
            )
        except ValueError as exc:
            raise HTTPException(422, detail=str(exc)) from exc
        response.headers["Cache-Control"] = (
            "public, max-age=300, s-maxage=1800, stale-while-revalidate=300"
        )
        return ForecastResponse(**result)
    response.headers["Cache-Control"] = "no-store, max-age=0"
    response.headers["CDN-Cache-Control"] = "no-store"
    if settings.forecast_system_paused:
        return ForecastResponse(
            **forecast_status.unavailable_station_response(station_id or "area", hours)
        )
    if not station_id:
        raise HTTPException(422, detail="station_target_required_for_local_forecast")
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
    response: Response,
    horizon: int = Query(12),
    grid_size: int = Query(12, ge=4, le=30),
    min_lat: float | None = Query(default=None, ge=-90, le=90),
    max_lat: float | None = Query(default=None, ge=-90, le=90),
    min_lon: float | None = Query(default=None, ge=-180, le=180),
    max_lon: float | None = Query(default=None, ge=-180, le=180),
):
    response.headers["Cache-Control"] = "no-store, max-age=0"
    response.headers["CDN-Cache-Control"] = "no-store"
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
    if settings.external_forecast_enabled:
        if bounds is None:
            raise HTTPException(422, detail="surface_bounds_required")
        result = await external_forecast.surface_forecast(horizon, grid_size, bounds)
        response.headers["Cache-Control"] = (
            "public, max-age=300, s-maxage=1800, stale-while-revalidate=300"
        )
        return ForecastSurfaceResponse(**result)
    if settings.forecast_system_paused:
        return ForecastSurfaceResponse(
            **forecast_status.unavailable_surface_response(horizon, grid_size, bounds)
        )
    try:
        response, ledgers = await run_in_threadpool(
            forecasting.surface_forecast, horizon, grid_size, bounds
        )
    except ValueError as exc:
        raise HTTPException(422, detail=str(exc)) from exc
    for ledger in ledgers:
        background_tasks.add_task(forecasting.persist_ledger, ledger)
    return ForecastSurfaceResponse(**response)
