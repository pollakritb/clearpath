"""Pure rules for selecting and explaining user-facing PM2.5 forecasts."""

from __future__ import annotations

import math
from collections.abc import Sequence
from datetime import UTC, datetime

from .forecast_consensus import agreement_level

EXTERNAL_PROVIDERS = ("gistda", "openmeteo_cams", "openweather")
PROVIDER_PRIORITY = {
    provider: index for index, provider in enumerate(EXTERNAL_PROVIDERS)
}


def provider_sync_due(
    latest_run: dict | None,
    interval_hours: int,
    *,
    now: datetime | None = None,
) -> bool:
    """Return whether a provider needs sync, independent of delayed cron start time."""

    if interval_hours <= 0:
        raise ValueError("provider_sync_interval_must_be_positive")
    if not latest_run or latest_run.get("status") not in {"success", "partial"}:
        return True
    value = latest_run.get("completed_at") or latest_run.get("started_at")
    try:
        latest = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return True
    if latest.tzinfo is None:
        latest = latest.replace(tzinfo=UTC)
    checked_at = now or datetime.now(UTC)
    if checked_at.tzinfo is None:
        checked_at = checked_at.replace(tzinfo=UTC)
    return (checked_at - latest).total_seconds() >= interval_hours * 3600


def _finite_pm25(point: dict) -> float | None:
    try:
        value = float(point["pm25"])
    except (KeyError, TypeError, ValueError):
        return None
    return value if math.isfinite(value) and value >= 0 else None


def usable_external_points(points: Sequence[dict]) -> list[dict]:
    """Return one valid point per external provider in deterministic order."""

    selected: dict[str, dict] = {}
    for point in points:
        source = str(point.get("source") or "")
        value = _finite_pm25(point)
        if (
            source not in PROVIDER_PRIORITY
            or value is None
            or not point.get("available", True)
        ):
            continue
        selected.setdefault(source, {**point, "pm25": value})
    return sorted(selected.values(), key=lambda row: PROVIDER_PRIORITY[row["source"]])


def provider_uncertainty(
    selected_pm25: float, provider_values: Sequence[float], horizon_hours: int
) -> tuple[float, float]:
    """Explainable uncertainty envelope; it never changes a provider's raw value."""

    values = [float(value) for value in provider_values if math.isfinite(float(value))]
    horizon_factor = 1.0 + min(24, max(1, int(horizon_hours))) / 48.0
    minimum_half_width = max(5.0, selected_pm25 * 0.2) * horizon_factor
    lower = min(values) if values else selected_pm25
    upper = max(values) if values else selected_pm25
    lower = min(lower, selected_pm25 - minimum_half_width)
    upper = max(upper, selected_pm25 + minimum_half_width)
    return round(max(0.0, lower), 1), round(max(0.0, upper), 1)


def select_external_forecast(points: Sequence[dict], horizon_hours: int) -> dict | None:
    """Select one raw provider forecast and calculate comparison-only metadata."""

    usable = usable_external_points(points)
    if not usable:
        return None
    selected = usable[0]
    values = [float(row["pm25"]) for row in usable]
    agreement, relative_spread = agreement_level(values)
    lower, upper = provider_uncertainty(float(selected["pm25"]), values, horizon_hours)
    return {
        "source": selected["source"],
        "pm25": round(float(selected["pm25"]), 1),
        "lower": lower,
        "upper": upper,
        "agreement": agreement,
        "relative_spread": round(relative_spread, 4),
        "provider_count": len(usable),
        "method": "external-provider-selection-v1",
        "calibration_version": "provider-spread-envelope-v1",
    }


def forecast_availability(
    *,
    selected_sources: Sequence[str],
    max_provider_count: int,
    requested_hours: int,
    local_quality_sufficient: bool,
    low_agreement: bool = False,
) -> tuple[str, list[str]]:
    """Status is external-first and does not fail solely on stale local history."""

    external = [source for source in selected_sources if source in PROVIDER_PRIORITY]
    if external:
        reasons = []
        if len(external) < requested_hours:
            reasons.append("external_provider_partial_horizon")
        if max_provider_count < 2:
            reasons.append("single_external_provider")
        elif low_agreement:
            reasons.append("external_provider_disagreement")
        return ("available" if not reasons else "limited", reasons)
    if local_quality_sufficient:
        return "limited", ["external_provider_unavailable", "local_fallback_only"]
    return "unavailable", ["external_provider_unavailable", "local_inputs_unusable"]
