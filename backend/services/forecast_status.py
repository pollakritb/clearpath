"""Forecast maintenance responses with no prediction or data-source I/O."""

from datetime import UTC, datetime

FORECAST_PAUSED_REASON = "forecast_system_under_improvement"


def unavailable_station_response(station_id: str, hours: int) -> dict:
    """Return an explicit unavailable contract without computing a forecast."""
    generated_at = datetime.now(UTC).isoformat()
    return {
        "station_id": station_id,
        "generated_at": generated_at,
        "source_recorded_at": None,
        "horizon_hours": hours,
        "method": "paused",
        "source_points": 0,
        "model_version": None,
        "feature_version": None,
        "artifact_sha256": None,
        "coverage_target": 0.0,
        "data_quality": "limited",
        "quality": {
            "status": "limited",
            "ml_eligible": False,
            "reason_codes": [FORECAST_PAUSED_REASON],
            "warnings": [],
            "source_recorded_at": None,
            "input_freshness_minutes": None,
            "source_points": 0,
            "recent_required_points": 0,
            "missing_hours": 0,
            "duplicate_hours": 0,
            "optional_feature_completeness": 0.0,
            "optional_feature_states": {},
        },
        "fallback_reason": FORECAST_PAUSED_REASON,
        "fallback_reason_codes": [FORECAST_PAUSED_REASON],
        "warnings": [],
        "points": [],
        "forecast_status": "unavailable",
        "limitation_reason_codes": [FORECAST_PAUSED_REASON],
        "unavailable_reason_codes": [FORECAST_PAUSED_REASON],
        "agreement": None,
        "provider_count": 0,
        "sources": [],
        "provenance": {
            "status": "paused",
            "next_method": "clearpath-self-forecast-v1",
        },
        "forecast_mode": "unavailable",
        "recommended_source": None,
        "providers": [],
        "selection_evidence": {
            "basis": "freshness_fallback",
            "horizon_hours": None,
            "window_days": 0,
            "minimum_rows": 0,
            "ranked_sources": [],
            "scores": [],
            "evaluated_at": None,
            "expires_at": None,
        },
        "community_context": {
            "mode": "not_used",
            "affects_recommendation": False,
            "eligible_report_count": 0,
            "nearby_report_count": 0,
            "effective_sample_size": 0.0,
            "residual_pm25": 0.0,
            "trust_threshold": 60,
            "radius_km": 5.0,
            "policy": "approved-fresh-trust-corroborated-v1",
        },
    }


def unavailable_surface_response(
    horizon: int, grid_size: int, bounds: dict | None
) -> dict:
    """Return an empty map surface; zero is never represented as PM2.5."""
    return {
        "generated_at": datetime.now(UTC).isoformat(),
        "horizon_hours": horizon,
        "method": "paused",
        "source_policy": "official_stations_only",
        "station_count": 0,
        "grid_size": grid_size,
        "bounds": bounds or {},
        "coverage_counts": {"covered": 0, "sparse": 0, "unavailable": 0},
        "warnings": [FORECAST_PAUSED_REASON],
        "cells": [],
        "forecast_status": "unavailable",
        "unavailable_reason_codes": [FORECAST_PAUSED_REASON],
    }


def paused_job(provider: str) -> dict:
    """Stable 2xx response for disabled scheduler/manual invocations."""
    return {
        "ok": True,
        "provider": provider,
        "status": "paused",
        "reason": FORECAST_PAUSED_REASON,
    }
