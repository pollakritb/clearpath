"""GET /api/forecast — พยากรณ์ PM2.5 ระยะสั้นของสถานีจากข้อมูลย้อนหลัง."""

from fastapi import APIRouter, HTTPException, Query
from starlette.concurrency import run_in_threadpool

from ..algorithms.forecast import forecast_pm25
from ..models.schemas import ForecastPoint, ForecastResponse
from ..services import supabase_client
from ..services.forecast_models import predict_active_artifact

router = APIRouter()


@router.get("/forecast", response_model=ForecastResponse)
async def forecast(
    station_id: str = Query(...),
    hours: int = Query(12, ge=1, le=24),
):
    history = await run_in_threadpool(supabase_client.get_history, station_id, 96)
    try:
        result = await run_in_threadpool(forecast_pm25, history, hours)
    except ValueError as exc:
        raise HTTPException(422, detail=str(exc)) from exc
    current_inputs = await run_in_threadpool(
        supabase_client.get_latest_forecast_features, station_id
    )
    predictions: dict[int, dict] = {}
    reasons: set[str] = set()
    versions: set[str] = set()
    for horizon in (1, 3, 6, 12, 24):
        if horizon > hours:
            continue
        prediction, reason = await run_in_threadpool(
            predict_active_artifact, horizon, history, current_inputs
        )
        if prediction:
            predictions[horizon] = prediction
            versions.add(prediction["version"])
        elif reason:
            reasons.add(reason)

    points = result["points"]
    for horizon, prediction in predictions.items():
        point = points[horizon - 1]
        point.update(
            {
                "pm25": round(prediction["pm25"], 1),
                "lower": round(prediction["lower"], 1),
                "upper": round(prediction["upper"], 1),
            }
        )
    return ForecastResponse(
        station_id=station_id,
        generated_at=result["generated_at"],
        horizon_hours=hours,
        method="hybrid_xgboost_gated" if predictions else result["method"],
        source_points=result["source_points"],
        model_version=",".join(sorted(versions)) if versions else None,
        data_quality="sufficient" if result["source_points"] >= 24 else "limited",
        fallback_reason=",".join(sorted(reasons)) if reasons else None,
        points=[ForecastPoint(**p) for p in points],
    )
