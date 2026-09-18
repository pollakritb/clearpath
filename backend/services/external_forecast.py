"""Serve raw Open-Meteo/CAMS PM2.5 forecasts without local modelling."""

from __future__ import annotations

from datetime import UTC, datetime

from starlette.concurrency import run_in_threadpool

from ..algorithms.external_forecast import select_horizon_rows, select_hourly_rows
from ..core.errors import UpstreamError
from . import openmeteo_air, supabase_client

PROVIDER = "openmeteo_cams"
PROVIDER_LABEL = "CAMS / Open-Meteo"
ATTRIBUTION = "CAMS ENSEMBLE data provided by Copernicus via Open-Meteo"
ATTRIBUTION_URL = "https://open-meteo.com/en/docs/air-quality-api"
LICENSE_URL = "https://open-meteo.com/en/terms"


def _quality(source_points: int, generated_at: str) -> dict:
    return {
        "status": "limited",
        "ml_eligible": False,
        "reason_codes": ["single_external_provider"],
        "warnings": ["single_external_provider"],
        "source_recorded_at": generated_at,
        "input_freshness_minutes": 0,
        "source_points": source_points,
        "recent_required_points": 0,
        "missing_hours": 0,
        "duplicate_hours": 0,
        "optional_feature_completeness": 0,
        "optional_feature_states": {},
    }


def _provider_summary(generated_at: str, coverage_hours: int) -> dict:
    return {
        "source": PROVIDER,
        "label": PROVIDER_LABEL,
        "attribution": ATTRIBUTION,
        "attribution_url": ATTRIBUTION_URL,
        "available": True,
        "selected": True,
        "latest_issued_at": generated_at,
        "freshness_status": "fresh",
        "coverage_hours": coverage_hours,
        "maximum_horizon_hours": 120,
        "stale_after_hours": 18,
        "temporal_resolution_hours": 3,
        "spatial_resolution_km": 45,
        "license": "CC BY 4.0",
        "license_url": LICENSE_URL,
        "issued_time_kind": "retrieved_at",
        "usage_note": "Raw CAMS global PM2.5 forecast; no ClearPath adjustment.",
    }


def _selection_evidence() -> dict:
    return {
        "basis": "freshness_fallback",
        "horizon_hours": None,
        "window_days": 0,
        "minimum_rows": 0,
        "ranked_sources": [PROVIDER],
        "scores": [],
        "evaluated_at": None,
        "expires_at": None,
    }


def _community_context() -> dict:
    return {
        "mode": "not_used",
        "affects_recommendation": False,
        "eligible_report_count": 0,
        "nearby_report_count": 0,
        "effective_sample_size": 0,
        "residual_pm25": 0,
        "trust_threshold": 60,
        "radius_km": 5,
        "policy": "external-provider-only-v1",
    }


async def station_forecast(station_id: str, hours: int) -> dict:
    station = await run_in_threadpool(supabase_client.get_station_by_id, station_id)
    if not station:
        raise ValueError("station_not_found")
    if station.get("lat") is None or station.get("lon") is None:
        raise ValueError("station_coordinates_missing")

    requested_hours = max(1, min(24, hours))
    result = await openmeteo_air.get_forecasts(
        [{"id": station_id, "lat": station["lat"], "lon": station["lon"]}],
        forecast_hours=requested_hours + 2,
    )
    generated_at = datetime.now(UTC).isoformat()
    selected = select_hourly_rows(result.get(station_id, []), requested_hours)
    if not selected:
        raise UpstreamError("Open-Meteo/CAMS returned no usable PM2.5 forecast")

    points = []
    sources = []
    for row in selected:
        value = round(float(row["pm25"]), 1)
        common = {
            "horizon_hours": row["horizon_hours"],
            "forecast_at": row["forecast_at"],
            "pm25": value,
        }
        points.append(
            {
                **common,
                "lower": value,
                "upper": value,
                "method": "raw_openmeteo_cams",
                "coverage_target": 0,
                "calibration_version": "not_applicable",
                "agreement": None,
                "provider_count": 1,
                "source": PROVIDER,
            }
        )
        sources.append(
            {
                **common,
                "source": PROVIDER,
                "weight": 1,
                "available": True,
                "issued_at": generated_at,
            }
        )

    return {
        "station_id": station_id,
        "generated_at": generated_at,
        "source_recorded_at": generated_at,
        "horizon_hours": requested_hours,
        "method": "raw_openmeteo_cams",
        "source_points": len(points),
        "coverage_target": 0,
        "data_quality": "limited",
        "quality": _quality(len(points), generated_at),
        "fallback_reason": None,
        "fallback_reason_codes": [],
        "warnings": ["single_external_provider"],
        "points": points,
        "forecast_status": "limited",
        "limitation_reason_codes": ["single_external_provider"],
        "unavailable_reason_codes": [],
        "agreement": None,
        "provider_count": 1,
        "sources": sources,
        "provenance": {
            "provider": PROVIDER,
            "provider_url": ATTRIBUTION_URL,
            "source_lat": selected[0].get("source_lat"),
            "source_lon": selected[0].get("source_lon"),
            "value_policy": "raw_provider_value",
        },
        "forecast_mode": "external_provider",
        "recommended_source": PROVIDER,
        "providers": [_provider_summary(generated_at, len(points))],
        "selection_evidence": _selection_evidence(),
        "community_context": _community_context(),
    }


async def surface_forecast(
    horizon: int, grid_size: int, bounds: dict[str, float]
) -> dict:
    generated_at = datetime.now(UTC).isoformat()
    lat_step = (bounds["max_lat"] - bounds["min_lat"]) / (grid_size - 1)
    lon_step = (bounds["max_lon"] - bounds["min_lon"]) / (grid_size - 1)
    locations = [
        {
            "id": f"cell-{row}-{column}",
            "lat": bounds["min_lat"] + row * lat_step,
            "lon": bounds["min_lon"] + column * lon_step,
        }
        for row in range(grid_size)
        for column in range(grid_size)
    ]
    forecasts = await openmeteo_air.get_forecasts(locations, forecast_days=2)
    cells = []
    for location in locations:
        selected = select_horizon_rows(forecasts.get(location["id"], []), [horizon])
        value = round(float(selected[0]["pm25"]), 1) if selected else None
        cells.append(
            {
                "lat": location["lat"],
                "lon": location["lon"],
                "pm25": value,
                "lower": value,
                "upper": value,
                "coverage": "covered" if value is not None else "unavailable",
                "nearby_station_count": 0,
                "nearest_station_km": None,
            }
        )

    covered = sum(cell["coverage"] == "covered" for cell in cells)
    return {
        "generated_at": generated_at,
        "horizon_hours": horizon,
        "method": "raw_openmeteo_cams_grid",
        "source_policy": "official_stations_only",
        "station_count": 0,
        "grid_size": grid_size,
        "bounds": bounds,
        "coverage_counts": {
            "covered": covered,
            "sparse": 0,
            "unavailable": len(cells) - covered,
        },
        "warnings": ["single_external_provider"],
        "cells": cells,
        "forecast_status": "limited" if covered else "unavailable",
        "unavailable_reason_codes": []
        if covered
        else ["external_forecast_unavailable"],
    }
