"""Serve raw Open-Meteo/CAMS PM2.5 forecasts without local modelling."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from math import isfinite

from starlette.concurrency import run_in_threadpool

from ..algorithms.distance import haversine_km
from ..algorithms.external_forecast import MAX_CAMS_FORECAST_HOURS, select_hourly_rows
from . import supabase_client

PROVIDER = "openmeteo_cams"
PROVIDER_LABEL = "CAMS / Open-Meteo"
ATTRIBUTION = "CAMS ENSEMBLE data provided by Copernicus via Open-Meteo"
ATTRIBUTION_URL = "https://open-meteo.com/en/docs/air-quality-api"
LICENSE_URL = "https://open-meteo.com/en/terms"
MAX_SNAPSHOT_AGE_HOURS = 18
MAX_AREA_SOURCE_DISTANCE_KM = 45


def _quality(source_points: int, generated_at: str | None) -> dict:
    return {
        "status": "limited",
        "ml_eligible": False,
        "reason_codes": ["single_external_provider"]
        if source_points
        else ["stored_cams_unavailable"],
        "warnings": ["single_external_provider"] if source_points else [],
        "source_recorded_at": generated_at,
        "input_freshness_minutes": None,
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
        "maximum_horizon_hours": MAX_CAMS_FORECAST_HOURS,
        "stale_after_hours": MAX_SNAPSHOT_AGE_HOURS,
        "temporal_resolution_hours": 3,
        "spatial_resolution_km": 45,
        "license": "CC BY 4.0",
        "license_url": LICENSE_URL,
        "issued_time_kind": "retrieved_at",
        "usage_note": "Stored raw CAMS global PM2.5 forecast; no ClearPath adjustment.",
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


def _unavailable(
    station_id: str | None, lat: float, lon: float, requested_hours: int
) -> dict:
    reason = "stored_cams_unavailable"
    return {
        "station_id": station_id,
        "target_kind": "station" if station_id else "area",
        "requested_lat": lat,
        "requested_lon": lon,
        "grid_lat": None,
        "grid_lon": None,
        "fetched_at": None,
        "generated_at": datetime.now(UTC).isoformat(),
        "source_recorded_at": None,
        "horizon_hours": requested_hours,
        "method": "stored_openmeteo_cams",
        "source_points": 0,
        "coverage_target": 0,
        "data_quality": "limited",
        "quality": _quality(0, None),
        "fallback_reason": reason,
        "fallback_reason_codes": [reason],
        "warnings": [],
        "points": [],
        "forecast_status": "unavailable",
        "limitation_reason_codes": [],
        "unavailable_reason_codes": [reason],
        "agreement": None,
        "provider_count": 0,
        "sources": [],
        "provenance": {
            "provider": PROVIDER,
            "value_policy": "stored_raw_provider_value",
        },
        "forecast_mode": "unavailable",
        "recommended_source": None,
        "providers": [],
        "selection_evidence": _selection_evidence(),
        "community_context": _community_context(),
    }


async def station_forecast(station_id: str, hours: int) -> dict:
    station = await run_in_threadpool(supabase_client.get_station_by_id, station_id)
    if not station:
        raise ValueError("station_not_found")
    if station.get("lat") is None or station.get("lon") is None:
        raise ValueError("station_coordinates_missing")

    return await _target_forecast(
        station_id, float(station["lat"]), float(station["lon"]), station, hours
    )


async def area_forecast(lat: float, lon: float, hours: int) -> dict:
    stations = await run_in_threadpool(supabase_client.get_stations)
    candidates = []
    for station in stations:
        try:
            distance = haversine_km(
                lat, lon, float(station["lat"]), float(station["lon"])
            )
        except (KeyError, TypeError, ValueError):
            continue
        if isfinite(distance) and distance <= MAX_AREA_SOURCE_DISTANCE_KM:
            candidates.append((distance, station))
    for _, station in sorted(candidates, key=lambda item: item[0])[:5]:
        result = await _target_forecast(None, lat, lon, station, hours)
        if result["forecast_status"] != "unavailable":
            return result
    return _unavailable(None, lat, lon, max(1, min(MAX_CAMS_FORECAST_HOURS, hours)))


async def _target_forecast(
    station_id: str | None,
    lat: float,
    lon: float,
    source_station: dict,
    hours: int,
) -> dict:
    requested_hours = max(1, min(MAX_CAMS_FORECAST_HOURS, hours))
    now = datetime.now(UTC)
    snapshots = await run_in_threadpool(
        supabase_client.get_recent_cams_snapshots,
        str(source_station["id"]),
        (now - timedelta(hours=MAX_SNAPSHOT_AGE_HOURS)).isoformat(),
        now.isoformat(),
    )
    groups: dict[tuple[str, str], list[dict]] = {}
    for row in snapshots:
        if row.get("issued_at") and row.get("sync_run_id"):
            key = (str(row["issued_at"]), str(row["sync_run_id"]))
            groups.setdefault(key, []).append(row)
    for (issued_at, run_id), rows in sorted(groups.items(), reverse=True):
        run = await run_in_threadpool(supabase_client.get_provider_sync_run, run_id)
        if not run or run.get("status") not in {"success", "partial"}:
            continue
        provider_rows = [
            {
                "forecast_at": row["forecast_at"],
                "pm25": row["pm25"],
                "source_lat": (row.get("raw_metadata") or {}).get("grid_lat"),
                "source_lon": (row.get("raw_metadata") or {}).get("grid_lon"),
                "fetched_at": (row.get("raw_metadata") or {}).get("fetched_at")
                or issued_at,
            }
            for row in rows
        ]
        selected = select_hourly_rows(provider_rows, requested_hours, now=now)
        if selected:
            return _response(
                station_id,
                lat,
                lon,
                source_station,
                issued_at,
                selected,
                requested_hours,
            )
    return _unavailable(station_id, lat, lon, requested_hours)


def _response(
    station_id: str | None,
    lat: float,
    lon: float,
    source_station: dict,
    issued_at: str,
    selected: list[dict],
    requested_hours: int,
) -> dict:
    generated_at = datetime.now(UTC).isoformat()
    fetched_at = selected[0].get("fetched_at") or issued_at
    partial = len(selected) < requested_hours
    limitation_codes = ["single_external_provider"]
    if partial:
        limitation_codes.append("external_provider_partial_horizon")

    points = []
    sources = []
    for row in selected:
        value = round(float(row["pm25"]), 1)
        common = {
            "horizon_hours": row["horizon_hours"],
            "forecast_at": row["forecast_at"],
            "valid_at": row["forecast_at"],
            "pm25": value,
        }
        points.append(
            {
                **common,
                "lower": value,
                "upper": value,
                "method": "stored_openmeteo_cams",
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
                "issued_at": fetched_at,
            }
        )

    return {
        "station_id": station_id,
        "target_kind": "station" if station_id else "area",
        "requested_lat": lat,
        "requested_lon": lon,
        "grid_lat": selected[0].get("source_lat"),
        "grid_lon": selected[0].get("source_lon"),
        "fetched_at": fetched_at,
        "generated_at": generated_at,
        "source_recorded_at": issued_at,
        "horizon_hours": requested_hours,
        "method": "stored_openmeteo_cams",
        "source_points": len(points),
        "coverage_target": 0,
        "data_quality": "limited",
        "quality": _quality(len(points), issued_at),
        "fallback_reason": None,
        "fallback_reason_codes": [],
        "warnings": limitation_codes,
        "points": points,
        "forecast_status": "limited",
        "limitation_reason_codes": limitation_codes,
        "unavailable_reason_codes": [],
        "agreement": None,
        "provider_count": 1,
        "sources": sources,
        "provenance": {
            "provider": PROVIDER,
            "provider_url": ATTRIBUTION_URL,
            "source_lat": selected[0].get("source_lat"),
            "source_lon": selected[0].get("source_lon"),
            "requested_lat": lat,
            "requested_lon": lon,
            "source_station_id": str(source_station["id"]),
            "source_station_name": source_station.get("name_th")
            or source_station.get("name_en")
            or str(source_station["id"]),
            "source_station_distance_km": round(
                haversine_km(
                    lat,
                    lon,
                    float(source_station["lat"]),
                    float(source_station["lon"]),
                ),
                1,
            ),
            "domain": "cams_global",
            "value_policy": "stored_raw_provider_value",
        },
        "forecast_mode": "external_provider",
        "recommended_source": PROVIDER,
        "providers": [_provider_summary(issued_at, len(points))],
        "selection_evidence": _selection_evidence(),
        "community_context": _community_context(),
    }


async def surface_forecast(
    horizon: int, grid_size: int, bounds: dict[str, float]
) -> dict:
    """The unused surface route must never bypass stored forecast data."""

    return {
        "generated_at": datetime.now(UTC).isoformat(),
        "horizon_hours": horizon,
        "method": "stored_cams_surface_unavailable",
        "source_policy": "official_stations_only",
        "station_count": 0,
        "grid_size": grid_size,
        "bounds": bounds,
        "coverage_counts": {"covered": 0, "sparse": 0, "unavailable": 0},
        "warnings": ["stored_surface_not_available"],
        "cells": [],
        "forecast_status": "unavailable",
        "unavailable_reason_codes": ["stored_surface_not_available"],
    }
