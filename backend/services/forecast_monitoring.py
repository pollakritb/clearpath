"""Persist bounded weekly forecast drift snapshots for operations review."""

from __future__ import annotations

from collections import defaultdict
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from ..algorithms.forecast_monitoring import (
    missingness_drift,
    population_stability_index,
)
from ..core.config import settings
from . import supabase_client


def _missingness(rows: list[dict]) -> dict[str, float]:
    counts: dict[str, int] = defaultdict(int)
    missing: dict[str, int] = defaultdict(int)
    for row in rows:
        quality = (row.get("forecast_runs") or {}).get("feature_quality") or {}
        states = quality.get("optional_feature_states") or {}
        for feature, state in states.items():
            counts[str(feature)] += 1
            if state != "observed":
                missing[str(feature)] += 1
    return {
        feature: missing[feature] / count for feature, count in counts.items() if count
    }


def run_drift_snapshot(
    *,
    now: datetime | None = None,
    current_days: int = 7,
    reference_days: int = 28,
) -> dict:
    end = (now or datetime.now(UTC)).astimezone(UTC)
    current_start = end - timedelta(days=current_days)
    reference_start = current_start - timedelta(days=reference_days)
    reference = supabase_client.list_forecast_monitoring_rows(
        reference_start.isoformat(), current_start.isoformat()
    )
    current = supabase_client.list_forecast_monitoring_rows(
        current_start.isoformat(), end.isoformat()
    )
    by_horizon_reference: dict[int, list[dict]] = defaultdict(list)
    by_horizon_current: dict[int, list[dict]] = defaultdict(list)
    for row in reference:
        by_horizon_reference[int(row["horizon_hours"])].append(row)
    for row in current:
        by_horizon_current[int(row["horizon_hours"])].append(row)

    snapshots = []
    insufficient = []
    for horizon in (1, 3, 6, 12, 24):
        old = by_horizon_reference[horizon]
        new = by_horizon_current[horizon]
        if len(old) < 30 or len(new) < 30:
            insufficient.append(
                {"horizon_hours": horizon, "reference": len(old), "current": len(new)}
            )
            continue
        prediction = population_stability_index(
            [float(row["pm25"]) for row in old],
            [float(row["pm25"]) for row in new],
        )
        feature = missingness_drift(_missingness(old), _missingness(new))
        alerts = []
        if prediction["drifted"]:
            alerts.append("prediction_psi_high")
        if feature["drifted"]:
            alerts.append("feature_missingness_drift")
        versions = sorted(
            {str(row["model_version"]) for row in new if row.get("model_version")}
        )
        snapshots.append(
            {
                "id": str(uuid4()),
                "environment": settings.app_environment,
                "model_version": ",".join(versions) or None,
                "horizon_hours": horizon,
                "window_start": current_start.isoformat(),
                "window_end": end.isoformat(),
                "feature_drift": feature,
                "prediction_drift": prediction,
                "missingness": {
                    "reference": _missingness(old),
                    "current": _missingness(new),
                },
                "alert_codes": alerts,
                "created_at": end.isoformat(),
            }
        )
    supabase_client.insert_forecast_drift_snapshots(snapshots)
    return {
        "snapshots": len(snapshots),
        "alerts": sum(bool(row["alert_codes"]) for row in snapshots),
        "alert_codes": sorted(
            {code for row in snapshots for code in row.get("alert_codes", [])}
        ),
        "insufficient": insufficient,
    }
