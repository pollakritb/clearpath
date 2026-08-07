"""Pure data-quality rules for forecast training and inference.

The module deliberately performs no database, network or filesystem I/O.  It
keeps missing source data distinct from a real numeric zero and produces
deterministic manifests that can be audited before a model is trained.
"""

from __future__ import annotations

import hashlib
import json
import math
from collections import Counter, defaultdict
from collections.abc import Mapping, Sequence
from datetime import UTC, datetime, timedelta
from typing import Literal

from .distance import haversine_km

ValueState = Literal[
    "observed",
    "missing",
    "unavailable",
    "not_applicable",
    "invalid",
]

WEATHER_FEATURES = (
    "temperature",
    "humidity",
    "wind_speed",
    "wind_deg",
    "rain_mm",
)
FIRE_FEATURES = (
    "hotspot_count",
    "weighted_frp",
    "upwind_hotspot_count",
)

# Bounds reject impossible/corrupt values, not genuine high-pollution events.
# High PM2.5 remains usable and is separately flagged for review.
FEATURE_VALID_RANGES: dict[str, tuple[float | None, float | None]] = {
    "pm25": (0.0, 2_000.0),
    "temperature": (-50.0, 60.0),
    "humidity": (0.0, 100.0),
    "wind_speed": (0.0, 100.0),
    "wind_deg": (0.0, 360.0),
    "rain_mm": (0.0, 1_000.0),
    "pressure": (800.0, 1_100.0),
    "hotspot_count": (0.0, None),
    "weighted_frp": (0.0, None),
    "upwind_hotspot_count": (0.0, None),
}


def parse_timestamp(value: object) -> datetime:
    """Parse an ISO timestamp and normalize it to UTC."""

    if not value:
        raise ValueError("timestamp_missing")
    parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def evaluate_feature_value(
    name: str,
    value: object,
    *,
    source_status: str | None = None,
) -> dict:
    """Classify one value without conflating missing data with numeric zero."""

    normalized_status = (source_status or "").strip().lower()
    if normalized_status in {"unavailable", "upstream_unavailable", "error"}:
        return {
            "state": "unavailable",
            "value": None,
            "usable": False,
            "reasons": [f"{name}_source_unavailable"],
            "warnings": [],
        }
    if normalized_status in {"not_applicable", "n/a"}:
        return {
            "state": "not_applicable",
            "value": None,
            "usable": False,
            "reasons": [f"{name}_not_applicable"],
            "warnings": [],
        }
    if value is None or (isinstance(value, str) and not value.strip()):
        return {
            "state": "missing",
            "value": None,
            "usable": False,
            "reasons": [f"{name}_missing"],
            "warnings": [],
        }
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return {
            "state": "invalid",
            "value": None,
            "usable": False,
            "reasons": [f"{name}_not_numeric"],
            "warnings": [],
        }
    if not math.isfinite(numeric):
        return {
            "state": "invalid",
            "value": None,
            "usable": False,
            "reasons": [f"{name}_not_finite"],
            "warnings": [],
        }
    lower, upper = FEATURE_VALID_RANGES.get(name, (None, None))
    if lower is not None and numeric < lower:
        return {
            "state": "invalid",
            "value": numeric,
            "usable": False,
            "reasons": [f"{name}_below_valid_range"],
            "warnings": [],
        }
    if upper is not None and numeric > upper:
        return {
            "state": "invalid",
            "value": numeric,
            "usable": False,
            "reasons": [f"{name}_above_valid_range"],
            "warnings": [],
        }
    warnings = ["pm25_extreme_review"] if name == "pm25" and numeric > 500 else []
    return {
        "state": "observed",
        "value": numeric,
        "usable": True,
        "reasons": [],
        "warnings": warnings,
    }


def evaluate_forecast_row(
    row: Mapping[str, object],
    *,
    required_features: Sequence[str] = ("pm25",),
) -> dict:
    """Evaluate a raw hourly row and return explicit feature states/reasons."""

    reasons: list[str] = []
    warnings: list[str] = []
    feature_states: dict[str, str] = {}
    try:
        recorded_at = parse_timestamp(row.get("recorded_at"))
    except (TypeError, ValueError):
        recorded_at = None
        reasons.append("recorded_at_invalid")

    for name in ("pm25", *WEATHER_FEATURES, *FIRE_FEATURES):
        group_status = None
        if name in WEATHER_FEATURES:
            group_status = str(row.get("weather_status") or "") or None
        elif name in FIRE_FEATURES:
            group_status = str(row.get("fire_status") or "") or None
        result = evaluate_feature_value(
            name,
            row.get(name),
            source_status=str(row.get(f"{name}_status") or "") or group_status,
        )
        feature_states[name] = str(result["state"])
        warnings.extend(result["warnings"])
        if name in required_features and not result["usable"]:
            reasons.extend(result["reasons"])

    if recorded_at is not None:
        for key, value in row.items():
            if not key.endswith(("_source_at", "_issued_at")) or not value:
                continue
            try:
                if parse_timestamp(value) > recorded_at:
                    reasons.append(f"{key}_after_prediction_time")
            except (TypeError, ValueError):
                reasons.append(f"{key}_invalid")

    return {
        "usable": not reasons,
        "reasons": sorted(set(reasons)),
        "warnings": sorted(set(warnings)),
        "feature_states": feature_states,
        "recorded_at": recorded_at.isoformat() if recorded_at else None,
    }


def validate_hourly_sequence(rows: Sequence[Mapping[str, object]]) -> dict:
    """Find duplicate and missing station-hours without mutating input rows."""

    by_station: dict[str, list[datetime]] = defaultdict(list)
    invalid_timestamps = 0
    for row in rows:
        try:
            by_station[str(row.get("station_id") or "")].append(
                parse_timestamp(row.get("recorded_at"))
            )
        except (TypeError, ValueError):
            invalid_timestamps += 1

    duplicate_hours = 0
    missing_hours = 0
    station_summaries: dict[str, dict] = {}
    for station_id, timestamps in sorted(by_station.items()):
        hour_keys = [int(item.timestamp() // 3600) for item in timestamps]
        counts = Counter(hour_keys)
        duplicates = sum(count - 1 for count in counts.values() if count > 1)
        unique = sorted(counts)
        missing = sum(
            max(0, right - left - 1)
            for left, right in zip(unique, unique[1:], strict=False)
        )
        duplicate_hours += duplicates
        missing_hours += missing
        station_summaries[station_id] = {
            "observed_hours": len(unique),
            "duplicate_hours": duplicates,
            "missing_hours": missing,
        }
    return {
        "valid": not duplicate_hours and not missing_hours and not invalid_timestamps,
        "duplicate_hours": duplicate_hours,
        "missing_hours": missing_hours,
        "invalid_timestamps": invalid_timestamps,
        "stations": station_summaries,
    }


def evaluate_inference_quality(
    history: Sequence[Mapping[str, object]],
    current_inputs: Mapping[str, object],
    *,
    now: datetime | None = None,
    max_age_minutes: float = 90.0,
) -> dict:
    """Summarize freshness, PM lag continuity and optional-source completeness."""

    reference = (now or datetime.now(UTC)).astimezone(UTC)
    usable: list[tuple[datetime, float]] = []
    reasons: list[str] = []
    warnings: list[str] = []
    for row in history:
        value = evaluate_feature_value("pm25", row.get("pm25"))
        try:
            recorded_at = parse_timestamp(row.get("recorded_at"))
        except (TypeError, ValueError):
            continue
        if recorded_at > reference + timedelta(minutes=5):
            reasons.append("observation_timestamp_in_future")
            continue
        if value["usable"]:
            usable.append((recorded_at, float(value["value"])))
            warnings.extend(value["warnings"])
    usable.sort(key=lambda item: item[0])
    source_recorded_at = usable[-1][0] if usable else None
    freshness = (
        max(0.0, (reference - source_recorded_at).total_seconds() / 60)
        if source_recorded_at
        else None
    )
    if not usable:
        reasons.append("pm25_history_missing")
    elif freshness is not None and freshness > max_age_minutes:
        reasons.append("latest_observation_stale")

    recent = usable[-25:]
    missing_hours = 0
    duplicate_hours = 0
    if recent:
        hour_keys = [int(timestamp.timestamp() // 3600) for timestamp, _ in recent]
        counts = Counter(hour_keys)
        duplicate_hours = sum(count - 1 for count in counts.values() if count > 1)
        unique = sorted(counts)
        missing_hours = sum(
            max(0, right - left - 1)
            for left, right in zip(unique, unique[1:], strict=False)
        )
    if len(recent) < 25:
        reasons.append("insufficient_pm25_history")
    if missing_hours:
        reasons.append("recent_pm25_gap")
    if duplicate_hours:
        reasons.append("recent_pm25_duplicate")

    optional_states: dict[str, str] = {}
    observed_optional = 0
    optional_names = (*WEATHER_FEATURES, *FIRE_FEATURES)
    for name in optional_names:
        status = (
            current_inputs.get("weather_status")
            if name in WEATHER_FEATURES
            else current_inputs.get("fire_status")
        )
        evaluated = evaluate_feature_value(
            name,
            current_inputs.get(name),
            source_status=str(current_inputs.get(f"{name}_status") or status or ""),
        )
        optional_states[name] = str(evaluated["state"])
        if evaluated["usable"]:
            observed_optional += 1
    optional_completeness = observed_optional / len(optional_names)
    if optional_completeness < 0.5:
        warnings.append("optional_features_limited")

    blocking = sorted(set(reasons))
    ml_eligible = not blocking
    return {
        "status": "sufficient" if ml_eligible else "limited",
        "ml_eligible": ml_eligible,
        "reason_codes": blocking,
        "warnings": sorted(set(warnings)),
        "source_recorded_at": source_recorded_at.isoformat()
        if source_recorded_at
        else None,
        "input_freshness_minutes": round(freshness, 1)
        if freshness is not None
        else None,
        "source_points": len(usable),
        "recent_required_points": len(recent),
        "missing_hours": missing_hours,
        "duplicate_hours": duplicate_hours,
        "optional_feature_completeness": round(optional_completeness, 4),
        "optional_feature_states": optional_states,
    }


def lag_window_is_usable(
    rows: Sequence[Mapping[str, object]],
    index: int,
    lags: Sequence[int],
    *,
    tolerance_minutes: float = 5.0,
) -> tuple[bool, list[str]]:
    """Require real hourly lag timestamps and valid PM values for every lag."""

    if index < 0 or index >= len(rows):
        return False, ["lag_index_out_of_range"]
    reasons: list[str] = []
    try:
        current_time = parse_timestamp(rows[index].get("recorded_at"))
    except (TypeError, ValueError):
        return False, ["current_timestamp_invalid"]
    current_station = str(rows[index].get("station_id") or "")
    for lag in lags:
        past_index = index - lag
        if past_index < 0:
            reasons.append(f"lag_{lag}_missing")
            continue
        past = rows[past_index]
        if str(past.get("station_id") or "") != current_station:
            reasons.append(f"lag_{lag}_station_mismatch")
            continue
        try:
            past_time = parse_timestamp(past.get("recorded_at"))
            delta_minutes = (current_time - past_time).total_seconds() / 60
            if abs(delta_minutes - lag * 60) > tolerance_minutes:
                reasons.append(f"lag_{lag}_time_gap")
        except (TypeError, ValueError):
            reasons.append(f"lag_{lag}_timestamp_invalid")
        if not evaluate_feature_value("pm25", past.get("pm25"))["usable"]:
            reasons.append(f"lag_{lag}_pm25_invalid")
    return not reasons, sorted(set(reasons))


def detect_station_changes(
    rows: Sequence[Mapping[str, object]],
    *,
    relocation_threshold_km: float = 0.2,
) -> list[dict]:
    """Detect station relocation/device boundaries that must not be bridged silently."""

    grouped: dict[str, list[Mapping[str, object]]] = defaultdict(list)
    for row in rows:
        grouped[str(row.get("station_id") or "")].append(row)
    events: list[dict] = []
    for station_id, station_rows in sorted(grouped.items()):
        ordered = sorted(
            station_rows, key=lambda item: str(item.get("recorded_at") or "")
        )
        for previous, current in zip(ordered, ordered[1:], strict=False):
            changed: list[str] = []
            previous_device = previous.get("device_id") or previous.get("device_model")
            current_device = current.get("device_id") or current.get("device_model")
            if previous_device and current_device and previous_device != current_device:
                changed.append("device_changed")
            try:
                distance = haversine_km(
                    float(previous["lat"]),
                    float(previous["lon"]),
                    float(current["lat"]),
                    float(current["lon"]),
                )
                if distance > relocation_threshold_km:
                    changed.append("station_relocated")
            except (KeyError, TypeError, ValueError):
                distance = None
            if changed:
                events.append(
                    {
                        "station_id": station_id,
                        "recorded_at": str(current.get("recorded_at") or ""),
                        "changes": changed,
                        "distance_km": round(distance, 6)
                        if distance is not None
                        else None,
                    }
                )
    return events


def canonical_sha256(value: object) -> str:
    payload = json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def build_dataset_manifest(
    rows: Sequence[Mapping[str, object]],
    *,
    usable_keys: set[tuple[str, int]] | None = None,
    excluded_reasons: Mapping[str, int] | None = None,
    feature_version: str,
) -> dict:
    """Build deterministic station-hour completeness and provenance metadata."""

    normalized: list[tuple[str, int, datetime]] = []
    invalid_rows = 0
    for row in rows:
        station_id = str(row.get("station_id") or "")
        try:
            recorded_at = parse_timestamp(row.get("recorded_at"))
        except (TypeError, ValueError):
            invalid_rows += 1
            continue
        normalized.append(
            (station_id, int(recorded_at.timestamp() // 3600), recorded_at)
        )

    raw_keys = {(station_id, hour) for station_id, hour, _ in normalized}
    station_hours: dict[str, list[int]] = defaultdict(list)
    month_counts: Counter[str] = Counter()
    for station_id, hour, recorded_at in normalized:
        station_hours[station_id].append(hour)
        month_counts[recorded_at.strftime("%Y-%m")] += 1

    expected_station_hours = 0
    station_counts: dict[str, dict] = {}
    for station_id, hours in sorted(station_hours.items()):
        unique = sorted(set(hours))
        expected = unique[-1] - unique[0] + 1 if unique else 0
        observed = len(unique)
        expected_station_hours += expected
        station_counts[station_id] = {
            "observed_hours": observed,
            "expected_hours": expected,
            "completeness": observed / expected if expected else 0.0,
        }

    selected_usable = raw_keys if usable_keys is None else raw_keys & usable_keys
    usable_station_ids = sorted({station_id for station_id, _ in selected_usable})
    sequence = validate_hourly_sequence(rows)
    manifest = {
        "manifest_version": 1,
        "feature_version": feature_version,
        "raw_rows": len(rows),
        "valid_timestamp_rows": len(normalized),
        "unique_station_hours": len(raw_keys),
        "usable_station_hours": len(selected_usable),
        "expected_station_hours": expected_station_hours,
        "raw_completeness": (
            len(raw_keys) / expected_station_hours if expected_station_hours else 0.0
        ),
        "station_count": len(station_hours),
        "usable_station_count": len(usable_station_ids),
        "usable_station_ids": usable_station_ids,
        "observed_months": len(month_counts),
        "month_counts": dict(sorted(month_counts.items())),
        "station_counts": station_counts,
        "invalid_timestamp_rows": invalid_rows,
        "duplicate_hours": sequence["duplicate_hours"],
        "missing_hours": sequence["missing_hours"],
        "excluded_reasons": dict(sorted((excluded_reasons or {}).items())),
        "station_change_events": detect_station_changes(rows),
    }
    manifest["manifest_sha256"] = canonical_sha256(manifest)
    return manifest


def audit_point_in_time_examples(examples: Sequence[Mapping[str, object]]) -> dict:
    """Prove that features were available and targets occur after prediction time."""

    violations: list[dict] = []
    for index, example in enumerate(examples):
        try:
            prediction_at = parse_timestamp(example.get("prediction_at"))
        except (TypeError, ValueError):
            violations.append({"index": index, "code": "prediction_at_invalid"})
            continue
        try:
            target_at = parse_timestamp(example.get("target_at"))
            if target_at <= prediction_at:
                violations.append({"index": index, "code": "target_not_in_future"})
        except (TypeError, ValueError):
            violations.append({"index": index, "code": "target_at_invalid"})
        source_times = example.get("feature_source_times") or {}
        if not isinstance(source_times, Mapping):
            violations.append({"index": index, "code": "feature_sources_invalid"})
            continue
        for feature, source_at in source_times.items():
            try:
                if parse_timestamp(source_at) > prediction_at:
                    violations.append(
                        {
                            "index": index,
                            "code": "feature_from_future",
                            "feature": str(feature),
                        }
                    )
            except (TypeError, ValueError):
                violations.append(
                    {
                        "index": index,
                        "code": "feature_source_time_invalid",
                        "feature": str(feature),
                    }
                )
    return {
        "passed": not violations,
        "example_count": len(examples),
        "violations": violations,
        "checks": {
            "prediction_time_present": not any(
                item["code"] == "prediction_at_invalid" for item in violations
            ),
            "target_after_prediction": not any(
                item["code"] in {"target_at_invalid", "target_not_in_future"}
                for item in violations
            ),
            "features_available_at_prediction": not any(
                item["code"]
                in {
                    "feature_from_future",
                    "feature_source_time_invalid",
                    "feature_sources_invalid",
                }
                for item in violations
            ),
        },
    }
