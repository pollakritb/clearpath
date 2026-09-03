"""Pure, explainable multi-source and community PM2.5 consensus rules."""

from __future__ import annotations

import math
from collections.abc import Sequence

from .distance import haversine_km


def weighted_median(values: Sequence[tuple[float, float]]) -> float:
    """Return a robust weighted median, ignoring non-positive weights."""
    usable = sorted(
        ((float(value), float(weight)) for value, weight in values if weight > 0),
        key=lambda item: item[0],
    )
    if not usable:
        raise ValueError("weighted_median_requires_positive_weight")
    threshold = sum(weight for _value, weight in usable) / 2.0
    cumulative = 0.0
    for value, weight in usable:
        cumulative += weight
        if cumulative >= threshold:
            return value
    return usable[-1][0]


def effective_sample_size(weights: Sequence[float]) -> float:
    usable = [max(0.0, float(weight)) for weight in weights]
    denominator = sum(weight * weight for weight in usable)
    return (sum(usable) ** 2 / denominator) if denominator else 0.0


def provider_accuracy_weight(
    *,
    mae: float | None,
    false_safe_rate: float | None,
    evaluation_count: int,
    station_count: int,
) -> float:
    """Bootstrap equally; learn only after enough geographically diverse outcomes."""
    if evaluation_count < 300 or station_count < 3 or mae is None:
        return 1.0
    safe_mae = max(1.0, float(mae))
    false_safe_penalty = 1.0 + 2.0 * max(0.0, float(false_safe_rate or 0.0))
    return round(1.0 / (safe_mae * false_safe_penalty), 6)


def report_quality_weight(report: dict) -> float:
    """Quality weight from Trust, freshness, calibration, GPS and averaging period."""
    trust = max(0.0, min(100.0, float(report.get("trust_score") or 0.0))) / 100.0
    age_minutes = max(0.0, float(report.get("age_minutes") or 0.0))
    if age_minutes > 180.0:
        return 0.0
    freshness = 1.0 - (0.5 * age_minutes / 180.0)
    calibration = 1.2 if report.get("device_calibrated") else 1.0
    accuracy = report.get("gps_accuracy_m")
    gps = (
        1.0
        if accuracy is None or float(accuracy) <= 50
        else 0.9
        if float(accuracy) <= 100
        else 0.75
    )
    averaging = {
        "instant": 0.5,
        "1_minute": 0.75,
        "5_minutes": 1.0,
    }.get(str(report.get("averaging_period") or "instant"), 0.5)
    return round(trust * freshness * calibration * gps * averaging, 6)


def community_residual(
    *,
    station_lat: float,
    station_lon: float,
    community_reports: Sequence[dict],
    base_pm25: float,
    radius_km: float = 5.0,
) -> dict:
    """IDW of community residuals around a station using Haversine distance."""
    contributions: list[tuple[float, float]] = []
    report_weights: list[float] = []
    report_ids: list[str] = []
    for report in community_reports:
        if report.get("pm25") is None:
            continue
        distance = haversine_km(
            station_lat,
            station_lon,
            float(report["lat"]),
            float(report["lon"]),
        )
        if distance > radius_km:
            continue
        quality = report_quality_weight(report)
        if quality <= 0:
            continue
        spatial_weight = quality / ((distance + 0.25) ** 2)
        contributions.append((float(report["pm25"]) - base_pm25, spatial_weight))
        report_weights.append(quality)
        report_ids.append(str(report.get("id") or ""))
    if not contributions:
        return {
            "residual": 0.0,
            "report_count": 0,
            "effective_sample_size": 0.0,
            "report_ids": [],
        }
    return {
        "residual": round(
            sum(value * weight for value, weight in contributions)
            / sum(weight for _value, weight in contributions),
            4,
        ),
        "report_count": len(contributions),
        "effective_sample_size": round(effective_sample_size(report_weights), 4),
        "report_ids": report_ids,
    }


def agreement_level(values: Sequence[float]) -> tuple[str, float]:
    if len(values) < 2:
        return "low", 1.0
    center = max(1.0, abs(weighted_median([(value, 1.0) for value in values])))
    spread = (max(values) - min(values)) / center
    return ("high" if spread <= 0.2 else "medium" if spread <= 0.5 else "low", spread)


def _interval_value(point: dict, field: str) -> float:
    """Use the point estimate when a provider has no uncertainty interval."""

    value = point.get(field)
    return float(point["pm25"] if value is None else value)


def build_consensus(
    *,
    provider_points: Sequence[dict],
    horizon_hours: int,
    station_lat: float,
    station_lon: float,
    community_reports: Sequence[dict] = (),
) -> dict:
    """Blend providers and qualified community reports without a fixed hard cap."""
    usable = [point for point in provider_points if point.get("pm25") is not None]
    if not usable:
        raise ValueError("consensus_requires_provider_point")
    provider_pairs = [
        (float(point["pm25"]), max(0.0, float(point.get("weight") or 1.0)))
        for point in usable
    ]
    base = weighted_median(provider_pairs)
    community = community_residual(
        station_lat=station_lat,
        station_lon=station_lon,
        community_reports=community_reports,
        base_pm25=base,
    )
    corrected = max(
        0.0, base + community["residual"] * math.exp(-float(horizon_hours) / 6.0)
    )
    values = [float(point["pm25"]) for point in usable]
    agreement, relative_spread = agreement_level(values)
    agreement_factor = {"high": 1.0, "medium": 0.7, "low": 0.4}[agreement]
    averaging_factor = sum(
        report_quality_weight(report)
        for report in community_reports
        if report.get("pm25") is not None
    ) / max(1, len(community_reports))
    n_eff = float(community["effective_sample_size"])
    community_weight = (
        (n_eff / (n_eff + 2.0))
        * agreement_factor
        * averaging_factor
        * math.exp(-float(horizon_hours) / 6.0)
    )
    provider_confidence = agreement_factor * (len(usable) / (len(usable) + 2.0))
    combined = [(base, provider_confidence)]
    if community["report_count"]:
        combined.append((corrected, community_weight))
    consensus = max(0.0, weighted_median(combined))
    lowers = [_interval_value(point, "lower") for point in usable]
    uppers = [_interval_value(point, "upper") for point in usable]
    provider_half_width = max(
        max(uppers) - consensus,
        consensus - min(lowers),
        (max(values) - min(values)) / 2.0,
        5.0,
    )
    if agreement == "low":
        provider_half_width *= 1.25
    return {
        "pm25": round(consensus, 1),
        "lower": round(max(0.0, consensus - provider_half_width), 1),
        "upper": round(consensus + provider_half_width, 1),
        "agreement": agreement,
        "relative_spread": round(relative_spread, 4),
        "provider_count": len(usable),
        "community_report_count": int(community["report_count"]),
        "community_effective_sample_size": round(n_eff, 3),
        "community_weight": round(community_weight, 4),
        "community_residual": round(float(community["residual"]), 2),
        "community_report_ids": community["report_ids"],
    }
