"""Pure evidence scoring for external PM2.5 forecast providers."""

from __future__ import annotations

import math
from collections import defaultdict
from collections.abc import Mapping, Sequence
from datetime import UTC, datetime, timedelta

PROVIDER_METHOD_PREFIX = "provider:"
DEFAULT_EVIDENCE_DAYS = 14
DEFAULT_EVIDENCE_TTL_HOURS = 36
DEFAULT_MINIMUM_ROWS = 30


def _timestamp(value: object) -> datetime | None:
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


def provider_from_method(method: object) -> str | None:
    value = str(method or "")
    if not value.startswith(PROVIDER_METHOD_PREFIX):
        return None
    provider = value.removeprefix(PROVIDER_METHOD_PREFIX).strip()
    return provider or None


def rank_provider_evidence(
    rows: Sequence[Mapping[str, object]],
    *,
    now: datetime | None = None,
    window_days: int = DEFAULT_EVIDENCE_DAYS,
    minimum_rows: int = DEFAULT_MINIMUM_ROWS,
    ttl_hours: int = DEFAULT_EVIDENCE_TTL_HOURS,
    horizon_hours: int | None = None,
) -> dict:
    """Rank providers using recent settled errors, never provider brand priority.

    Only nationwide aggregate rows are used so a station with many requests cannot
    silently dominate the recommendation. MAE is the primary metric; false-safe
    rate and absolute bias are bounded safety tie-breakers.
    """

    checked_at = now or datetime.now(UTC)
    if checked_at.tzinfo is None:
        checked_at = checked_at.replace(tzinfo=UTC)
    cutoff = checked_at - timedelta(days=max(1, window_days))
    grouped: dict[str, list[Mapping[str, object]]] = defaultdict(list)
    for row in rows:
        provider = provider_from_method(row.get("method"))
        metrics = row.get("metrics")
        latest_forecast_at = (
            metrics.get("latest_forecast_at") if isinstance(metrics, Mapping) else None
        )
        evaluated_at = _timestamp(latest_forecast_at) or _timestamp(
            row.get("computed_at")
        )
        if (
            provider
            and evaluated_at
            and evaluated_at >= cutoff
            and str(row.get("station_id") or "all") == "all"
            and str(row.get("district") or "all") == "all"
            and (
                horizon_hours is None
                or int(row.get("horizon_hours") or 0) == horizon_hours
            )
        ):
            grouped[provider].append(row)

    scores = []
    for provider, members in grouped.items():
        sample_size = sum(max(0, int(row.get("rows") or 0)) for row in members)
        if sample_size <= 0:
            continue

        def weighted(
            name: str,
            default: float,
            data: Sequence[Mapping[str, object]] = members,
        ) -> float:
            pairs = [
                (float(row[name]), max(0, int(row.get("rows") or 0)))
                for row in data
                if row.get(name) is not None
                and math.isfinite(float(row[name]))
                and int(row.get("rows") or 0) > 0
            ]
            total = sum(weight for _value, weight in pairs)
            return (
                sum(value * weight for value, weight in pairs) / total
                if total
                else default
            )

        latest = max(
            parsed
            for row in members
            if (
                parsed := _timestamp(
                    (row.get("metrics") or {}).get("latest_forecast_at")
                    if isinstance(row.get("metrics"), Mapping)
                    else None
                )
                or _timestamp(row.get("computed_at"))
            )
            is not None
        )
        mae = weighted("mae", math.inf)
        false_safe_rate = weighted("false_safe_rate", 1.0)
        bias = weighted("bias", math.inf)
        eligible = (
            sample_size >= minimum_rows
            and checked_at - latest <= timedelta(hours=max(1, ttl_hours))
            and math.isfinite(mae)
        )
        # MAE remains dominant. Safety terms only separate near-equal providers.
        score = mae + min(1.0, max(0.0, false_safe_rate)) * 5 + min(20, abs(bias)) * 0.1
        scores.append(
            {
                "provider": provider,
                "eligible": eligible,
                "sample_size": sample_size,
                "mae": round(mae, 3) if math.isfinite(mae) else None,
                "false_safe_rate": round(false_safe_rate, 4),
                "bias": round(bias, 3) if math.isfinite(bias) else None,
                "score": round(score, 4) if math.isfinite(score) else None,
                "evaluated_at": latest.isoformat(),
                "expires_at": (latest + timedelta(hours=ttl_hours)).isoformat(),
            }
        )

    eligible = sorted(
        (row for row in scores if row["eligible"]),
        key=lambda row: (float(row["score"]), str(row["provider"])),
    )
    return {
        "basis": "retrospective_accuracy" if eligible else "freshness_fallback",
        "horizon_hours": horizon_hours,
        "window_days": max(1, window_days),
        "minimum_rows": minimum_rows,
        "ranked_sources": [str(row["provider"]) for row in eligible],
        "scores": sorted(scores, key=lambda row: str(row["provider"])),
        "evaluated_at": eligible[0]["evaluated_at"] if eligible else None,
        "expires_at": eligible[0]["expires_at"] if eligible else None,
    }


def source_sort_key(point: Mapping[str, object], evidence_rank: Sequence[str]) -> tuple:
    """Sort by evidence rank, then retrieval freshness and a stable neutral key."""

    source = str(point.get("source") or "")
    try:
        evidence_position = evidence_rank.index(source)
    except ValueError:
        evidence_position = len(evidence_rank)
    issued = _timestamp(point.get("issued_at"))
    freshness = -(issued.timestamp()) if issued else math.inf
    return (evidence_position, freshness, source)
