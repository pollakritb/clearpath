"""Forecast orchestration: quality gate, fallback, ledger and surface batch."""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from time import perf_counter
from uuid import uuid4

from ..algorithms.forecast import forecast_pm25
from ..algorithms.forecast_consensus import build_consensus
from ..algorithms.forecast_quality import evaluate_inference_quality
from ..algorithms.forecast_surface import forecast_surface
from ..algorithms.freshness import station_freshness
from ..core.config import settings
from . import supabase_client
from .community.presenter import present_report
from .forecast_models import (
    SUPPORTED_HORIZONS,
    predict_active_artifact,
    predict_shadow_artifact,
)

logger = logging.getLogger("clearpath.forecast")


def _parse_datetime(value: str) -> datetime | None:
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)
    except (TypeError, ValueError):
        return None


def _provider_points(snapshots: list[dict], forecast_at: str) -> list[dict]:
    target = _parse_datetime(forecast_at)
    if target is None:
        return []
    newest_issue: dict[str, datetime] = {}
    now = datetime.now(UTC)
    for row in snapshots:
        issued = _parse_datetime(str(row.get("issued_at") or ""))
        provider = str(row.get("provider") or "")
        if issued is None or (now - issued).total_seconds() > 26 * 3600:
            continue
        if provider not in newest_issue or issued > newest_issue[provider]:
            newest_issue[provider] = issued
    selected = []
    for provider, issued_at in newest_issue.items():
        candidates = []
        for row in snapshots:
            issued = _parse_datetime(str(row.get("issued_at") or ""))
            at = _parse_datetime(str(row.get("forecast_at") or ""))
            if (
                str(row.get("provider")) != provider
                or issued != issued_at
                or at is None
            ):
                continue
            candidates.append((abs((at - target).total_seconds()), row))
        if not candidates:
            continue
        delta, row = min(candidates, key=lambda item: item[0])
        if delta <= 5400 and row.get("pm25") is not None:
            selected.append(
                {
                    "source": provider,
                    "pm25": float(row["pm25"]),
                    "forecast_at": str(row["forecast_at"]),
                    "weight": 1.0,
                }
            )
    return selected


def _qualified_community(official: list[dict]) -> list[dict]:
    if not settings.community_forecast_shadow_enabled:
        return []
    approved = supabase_client.list_community_reports("approved", 500)
    result = []
    for row in approved:
        try:
            report = present_report(
                row,
                official_stations=official,
                approved_reports=approved,
                include_image=False,
                include_exact_location=True,
            )
        except (KeyError, TypeError, ValueError):
            continue
        corroborated = int(report.get("corroboration_count") or 0) >= 2
        high_trust_calibrated = float(report.get("trust_score") or 0) >= 80 and bool(
            report.get("device_calibrated")
        )
        if (
            report.get("status") == "approved"
            and report.get("is_fresh")
            and float(report.get("trust_score") or 0) >= 60
            and (corroborated or high_trust_calibrated)
            and not report.get("near_emission_source")
            and not report.get("duplicate_detected")
            and float(report.get("gps_accuracy_m") or 0) <= 200
        ):
            result.append(report)
    return result


def station_forecast(station_id: str, hours: int) -> tuple[dict, dict]:
    started = perf_counter()
    history = supabase_client.get_history(station_id, max(96, hours + 72))
    baseline = forecast_pm25(history, hours)
    inputs = supabase_client.get_latest_forecast_features(station_id)
    inputs["station_id"] = station_id
    generated_at = datetime.now(UTC)
    quality = evaluate_inference_quality(history, inputs, now=generated_at)
    station_metadata = supabase_client.get_station_by_id(station_id) or {}
    provider_snapshots = supabase_client.get_provider_snapshots(station_id)
    community_reports = (
        _qualified_community(supabase_client.get_stations())
        if settings.community_forecast_shadow_enabled
        else []
    )
    points = []
    source_details = []
    consensus_rows = []
    community_features = []
    reason_codes = set(quality["reason_codes"])
    versions: set[str] = set()
    feature_versions: set[str] = set()
    artifact_shas: set[str] = set()
    coverage_targets: set[float] = set()
    for horizon, baseline_point in enumerate(baseline["points"], start=1):
        point = {
            **baseline_point,
            "horizon_hours": horizon,
            "method": "damped-local-trend-v1",
            "model_version": None,
            "feature_version": None,
            "artifact_sha256": None,
            "coverage_target": 0.9,
            "calibration_version": "baseline-robust-mad-v1",
        }
        if horizon in SUPPORTED_HORIZONS:
            if quality["ml_eligible"]:
                prediction, reason = predict_active_artifact(
                    horizon,
                    history,
                    inputs,
                    data_quality=str(quality["status"]),
                )
            else:
                prediction, reason = None, "input_quality_gate_failed"
            if prediction:
                point.update(
                    {
                        "pm25": round(prediction["pm25"], 1),
                        "lower": round(prediction["lower"], 1),
                        "upper": round(prediction["upper"], 1),
                        "method": "xgboost-registry-v2",
                        "model_version": prediction["version"],
                        "feature_version": prediction["feature_version"],
                        "artifact_sha256": prediction["artifact_sha256"],
                        "coverage_target": prediction["coverage_target"],
                        "calibration_version": prediction["calibration_version"],
                    }
                )
                versions.add(str(prediction["version"]))
                feature_versions.add(str(prediction["feature_version"]))
                artifact_shas.add(str(prediction["artifact_sha256"]))
                coverage_targets.add(float(prediction["coverage_target"]))
            elif reason:
                reason_codes.add(reason)
        sources = [
            {
                "source": "clearpath",
                "horizon_hours": horizon,
                "forecast_at": point["forecast_at"],
                "pm25": point["pm25"],
                "lower": point["lower"],
                "upper": point["upper"],
                "weight": 1.0,
                "available": True,
            }
        ]
        sources.extend(
            {
                **provider,
                "horizon_hours": horizon,
                "lower": None,
                "upper": None,
                "available": True,
            }
            for provider in _provider_points(provider_snapshots, point["forecast_at"])
        )
        if (
            station_metadata.get("lat") is not None
            and station_metadata.get("lon") is not None
        ):
            consensus = build_consensus(
                provider_points=sources,
                horizon_hours=horizon,
                station_lat=float(station_metadata["lat"]),
                station_lon=float(station_metadata["lon"]),
                community_reports=community_reports,
            )
            consensus["horizon_hours"] = horizon
            point.update(
                {
                    "agreement": consensus["agreement"],
                    "provider_count": consensus["provider_count"],
                }
            )
            consensus_rows.append(consensus)
            community_features.append(
                {
                    "horizon_hours": horizon,
                    "report_ids": consensus["community_report_ids"],
                    "report_count": consensus["community_report_count"],
                    "effective_sample_size": consensus[
                        "community_effective_sample_size"
                    ],
                    "residual_pm25": consensus["community_residual"],
                    "community_weight": consensus["community_weight"],
                }
            )
        source_details.extend(sources)
        points.append(point)

    methods = {str(point["method"]) for point in points}
    method = next(iter(methods)) if len(methods) == 1 else "hybrid-registry-baseline"
    warnings = list(quality["warnings"])
    if any(point["upper"] - point["lower"] >= 50 for point in points):
        warnings.append("wide_uncertainty_interval")
    input_age = quality["input_freshness_minutes"]
    unavailable_reasons = []
    if quality["source_points"] < settings.forecast_station_min_history_points:
        unavailable_reasons.append("insufficient_hourly_history")
    if input_age is None or input_age > settings.forecast_station_max_age_minutes:
        unavailable_reasons.append("official_observation_stale")
    provider_count = max((row["provider_count"] for row in consensus_rows), default=1)
    forecast_status = (
        "unavailable"
        if unavailable_reasons
        else "limited"
        if provider_count < 2
        else "available"
    )
    agreements = [row["agreement"] for row in consensus_rows]
    overall_agreement = (
        (
            "low"
            if "low" in agreements
            else "medium"
            if "medium" in agreements
            else "high"
        )
        if agreements
        else None
    )
    response = {
        "station_id": station_id,
        "generated_at": generated_at.isoformat(),
        "source_recorded_at": quality["source_recorded_at"],
        "horizon_hours": hours,
        "method": method,
        "source_points": quality["source_points"],
        "model_version": ",".join(sorted(versions)) if versions else None,
        "feature_version": ",".join(sorted(feature_versions))
        if feature_versions
        else None,
        "artifact_sha256": ",".join(sorted(artifact_shas)) if artifact_shas else None,
        "coverage_target": min(coverage_targets) if coverage_targets else 0.9,
        "data_quality": quality["status"],
        "quality": quality,
        "fallback_reason": ",".join(sorted(reason_codes)) if reason_codes else None,
        "fallback_reason_codes": sorted(reason_codes),
        "warnings": sorted(set(warnings)),
        "points": points,
        "forecast_status": forecast_status,
        "unavailable_reason_codes": unavailable_reasons,
        "agreement": overall_agreement,
        "provider_count": provider_count,
        "sources": source_details,
        "provenance": {
            "official_source": "Air4Thai via Supabase hourly sync",
            "provider_sources": sorted({str(row["source"]) for row in source_details}),
            "community_policy": "approved-fresh-trust-corroborated-v1",
            "community_shadow_enabled": settings.community_forecast_shadow_enabled,
            "provider_comparison_only": True,
            "consensus_served": False,
            "consensus_status": "shadow",
        },
    }
    run_id = str(uuid4())
    ledger_predictions = [
        {
            "run_id": run_id,
            "horizon_hours": point["horizon_hours"],
            "variant": "served",
            "forecast_at": point["forecast_at"],
            "pm25": point["pm25"],
            "lower": point["lower"],
            "upper": point["upper"],
            "method": point["method"],
            "model_version": point["model_version"],
            "artifact_sha256": point["artifact_sha256"],
            "calibration_version": point["calibration_version"],
            "coverage_target": point["coverage_target"],
            "baseline_pm25": baseline["points"][point["horizon_hours"] - 1]["pm25"],
        }
        for point in points
    ]
    if settings.ml_forecast_shadow_enabled and quality["ml_eligible"]:
        for point in points:
            horizon = int(point["horizon_hours"])
            if horizon not in SUPPORTED_HORIZONS:
                continue
            shadow, _reason = predict_shadow_artifact(
                horizon,
                history,
                inputs,
                data_quality=str(quality["status"]),
            )
            if not shadow:
                continue
            ledger_predictions.append(
                {
                    "run_id": run_id,
                    "horizon_hours": horizon,
                    "variant": "shadow",
                    "forecast_at": point["forecast_at"],
                    "pm25": round(shadow["pm25"], 1),
                    "lower": round(shadow["lower"], 1),
                    "upper": round(shadow["upper"], 1),
                    "method": "xgboost-shadow-v2",
                    "model_version": shadow["version"],
                    "artifact_sha256": shadow["artifact_sha256"],
                    "calibration_version": shadow["calibration_version"],
                    "coverage_target": shadow["coverage_target"],
                    "baseline_pm25": baseline["points"][horizon - 1]["pm25"],
                }
            )
    latency_ms = round((perf_counter() - started) * 1000, 1)
    ledger = {
        "run": {
            "id": run_id,
            "station_id": station_id,
            "district": station_metadata.get("district"),
            "generated_at": generated_at.isoformat(),
            "method": method,
            "model_version": response["model_version"],
            "fallback_reason": response["fallback_reason"],
            "data_quality": quality["status"],
            "source_points": quality["source_points"],
            "environment": settings.app_environment,
            "feature_version": response["feature_version"],
            "artifact_sha256": response["artifact_sha256"],
            "source_recorded_at": quality["source_recorded_at"],
            "input_freshness_minutes": quality["input_freshness_minutes"],
            "feature_quality": quality,
            "coverage": {"coverage_target": response["coverage_target"]},
            "warnings": response["warnings"],
            "latency_ms": latency_ms,
        },
        "predictions": ledger_predictions,
        "consensus_rows": consensus_rows,
        "source_details": source_details,
        "community_features": community_features,
    }
    return response, ledger


def persist_ledger(ledger: dict) -> None:
    """Best-effort background persistence; forecast responses never depend on it."""

    try:
        supabase_client.insert_forecast_ledger(ledger["run"], ledger["predictions"])
        generated_at = str(ledger["run"]["generated_at"])
        station_id = str(ledger["run"]["station_id"])
        source_by_horizon: dict[int, list[dict]] = {}
        for source in ledger.get("source_details", []):
            source_by_horizon.setdefault(int(source["horizon_hours"]), []).append(
                source
            )
        feature_by_horizon = {
            int(row["horizon_hours"]): row
            for row in ledger.get("community_features", [])
        }
        for consensus in ledger.get("consensus_rows", []):
            horizon = int(consensus.get("horizon_hours", 0))
            if not horizon:
                continue
            sources = source_by_horizon.get(horizon, [])
            forecast_at = next((row["forecast_at"] for row in sources), generated_at)
            supabase_client.upsert_forecast_consensus(
                {
                    "station_id": station_id,
                    "horizon_hours": horizon,
                    "generated_at": generated_at,
                    "forecast_at": forecast_at,
                    "pm25": consensus["pm25"],
                    "lower": consensus["lower"],
                    "upper": consensus["upper"],
                    "agreement": consensus["agreement"],
                    "provider_count": consensus["provider_count"],
                    "community_report_count": consensus["community_report_count"],
                    "community_effective_sample_size": consensus[
                        "community_effective_sample_size"
                    ],
                    "community_weight": consensus["community_weight"],
                    "provenance": {
                        "serving_status": "shadow",
                        "community_report_ids": consensus["community_report_ids"],
                    },
                },
                [
                    {
                        "station_id": station_id,
                        "horizon_hours": horizon,
                        "generated_at": generated_at,
                        "source": row["source"],
                        "pm25": row["pm25"],
                        "lower": row.get("lower"),
                        "upper": row.get("upper"),
                        "weight": row.get("weight", 1.0),
                    }
                    for row in sources
                ],
                (
                    {
                        "station_id": station_id,
                        "generated_at": generated_at,
                        "report_ids": feature_by_horizon[horizon]["report_ids"],
                        "report_count": feature_by_horizon[horizon]["report_count"],
                        "effective_sample_size": feature_by_horizon[horizon][
                            "effective_sample_size"
                        ],
                        "residual_pm25": feature_by_horizon[horizon]["residual_pm25"],
                        "community_weight": feature_by_horizon[horizon][
                            "community_weight"
                        ],
                    }
                    if horizon in feature_by_horizon
                    and feature_by_horizon[horizon]["report_count"]
                    else None
                ),
            )
    except Exception:
        logger.exception(
            "forecast_ledger_write_failed",
            extra={"run_id": ledger.get("run", {}).get("id")},
        )


def surface_forecast(
    horizon: int, grid_size: int, bounds: dict[str, float] | None = None
) -> tuple[dict, list[dict]]:
    if horizon not in SUPPORTED_HORIZONS:
        raise ValueError("unsupported_surface_horizon")
    official = []
    ledgers = []
    methods = set()
    generated = []
    for station in supabase_client.get_stations():
        try:
            float(station["lat"])
            float(station["lon"])
        except (KeyError, TypeError, ValueError):
            continue
        freshness = station_freshness(station.get("recorded_at"))
        if bounds and not (
            bounds["min_lat"] <= float(station["lat"]) <= bounds["max_lat"]
            and bounds["min_lon"] <= float(station["lon"]) <= bounds["max_lon"]
        ):
            continue
        if not freshness["eligible_for_surface"]:
            continue
        try:
            response, ledger = station_forecast(str(station["id"]), horizon)
        except ValueError:
            continue
        point = response["points"][horizon - 1]
        official.append(
            {
                "station_id": station["id"],
                "lat": station["lat"],
                "lon": station["lon"],
                "pm25": point["pm25"],
                "lower": point["lower"],
                "upper": point["upper"],
                "method": point["method"],
            }
        )
        methods.add(str(point["method"]))
        generated.append(str(response["generated_at"]))
        ledgers.append(ledger)
    surface = forecast_surface(official, grid_size=grid_size, bounds=bounds)
    sparse = surface["coverage_counts"]["sparse"]
    unavailable = surface["coverage_counts"]["unavailable"]
    warnings = []
    if sparse:
        warnings.append("sparse_station_coverage")
    if unavailable:
        warnings.append("surface_cells_masked_no_coverage")
    response = {
        "generated_at": max(generated) if generated else datetime.now(UTC).isoformat(),
        "horizon_hours": horizon,
        "method": next(iter(methods)) if len(methods) == 1 else "mixed",
        "source_policy": "official_stations_only",
        "station_count": len(official),
        "grid_size": surface["grid_size"],
        "bounds": surface["bounds"],
        "coverage_counts": surface["coverage_counts"],
        "warnings": warnings,
        "cells": surface["cells"],
    }
    return response, ledgers
