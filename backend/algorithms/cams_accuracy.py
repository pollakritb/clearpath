"""Pure, offline CAMS validation; no public forecast correction is applied."""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from math import exp, isfinite
from statistics import median

from .distance import haversine_km

HIGH_PM25 = 37.5
MAX_NEIGHBOR_KM = 100.0
MAX_RESIDUAL_AGE_HOURS = 48.0
MAX_BIAS_AGE_HOURS = 14 * 24.0


def _time(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def aggregate(rows: list[dict], *, threshold: float = HIGH_PM25) -> dict:
    """MAE, signed bias and high-dust detection on observed 1h means."""

    if not rows:
        return {
            "count": 0,
            "distinct_station_hours": 0,
            "mae": None,
            "bias": None,
            "high_event_count": 0,
            "high_event_recall": None,
            "high_event_precision": None,
        }
    errors = [float(row["prediction"]) - float(row["observed_pm25"]) for row in rows]
    true_high = sum(float(row["observed_pm25"]) > threshold for row in rows)
    predicted_high = sum(float(row["prediction"]) > threshold for row in rows)
    hits = sum(
        float(row["prediction"]) > threshold and float(row["observed_pm25"]) > threshold
        for row in rows
    )
    return {
        "count": len(rows),
        "distinct_station_hours": len(
            {(row["station_id"], row["valid_at"]) for row in rows}
        ),
        "mae": sum(abs(error) for error in errors) / len(errors),
        "bias": sum(errors) / len(errors),
        "high_event_count": true_high,
        "high_event_recall": hits / true_high if true_high else None,
        "high_event_precision": hits / predicted_high if predicted_high else None,
    }


def grouped_metrics(rows: list[dict]) -> dict:
    """Raw descriptive metrics with explicit station/region/lead cohorts."""

    groups: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        scored = {**row, "prediction": row["forecast_pm25"]}
        groups["all"].append(scored)
        groups[f"station:{row['station_id']}"].append(scored)
        groups[f"region:{row.get('region') or 'unknown'}"].append(scored)
        groups[f"lead:{'1-6h' if row['lead_hours'] <= 6 else '7-24h'}"].append(scored)
        groups[f"observed_high:{float(row['observed_pm25']) > HIGH_PM25}"].append(
            scored
        )
    return {name: aggregate(values) for name, values in sorted(groups.items())}


def candidate_predictions(
    target: dict, history: list[dict], *, held_out_station: bool = False
) -> dict[str, float | None]:
    """Calculate shadow-only alternatives from evidence available before fetch."""

    fetched = _time(target["fetched_at"])
    prior = []
    for row in history:
        try:
            observed_fetched = _time(row["observation_fetched_at"])
            observed_at = _time(row["valid_at"])
        except (KeyError, TypeError, ValueError):
            continue
        if observed_fetched >= fetched or observed_at >= fetched:
            continue
        age_hours = (fetched - observed_at).total_seconds() / 3600
        if age_hours < 0 or age_hours > MAX_BIAS_AGE_HOURS:
            continue
        prior.append((row, age_hours))
    # A valid station-hour may have several forecast snapshots. Count one
    # residual per station-hour when learning, while preserving all test rows.
    distinct: dict[tuple[str, str], tuple[dict, float]] = {}
    for row, age in prior:
        key = (str(row["station_id"]), str(row["valid_at"]))
        if key not in distinct or row["fetched_at"] > distinct[key][0]["fetched_at"]:
            distinct[key] = (row, age)
    prior = list(distinct.values())
    raw = float(target["forecast_pm25"])
    result: dict[str, float | None] = {
        "raw": raw,
        "station_bias": None,
        "spatial_residual": None,
        "persistence": None,
    }
    station_history = [
        (row, age) for row, age in prior if row["station_id"] == target["station_id"]
    ]
    if station_history and not held_out_station:
        recent_station_history = [
            (row, age) for row, age in station_history if age <= MAX_RESIDUAL_AGE_HOURS
        ]
        if recent_station_history:
            latest = max(recent_station_history, key=lambda item: item[0]["valid_at"])[
                0
            ]
            result["persistence"] = float(latest["observed_pm25"])
        if len({row["valid_at"] for row, _ in station_history}) >= 10:
            result["station_bias"] = max(
                0.0, raw - median(float(row["error"]) for row, _ in station_history)
            )

    lat, lon = target.get("requested_lat"), target.get("requested_lon")
    weighted = []
    if lat is not None and lon is not None:
        newest_nearby: dict[str, tuple[dict, float, float]] = {}
        for row, age_hours in prior:
            if (
                row["station_id"] == target["station_id"]
                or age_hours > MAX_RESIDUAL_AGE_HOURS
                or row.get("requested_lat") is None
                or row.get("requested_lon") is None
            ):
                continue
            distance = haversine_km(
                float(lat),
                float(lon),
                float(row["requested_lat"]),
                float(row["requested_lon"]),
            )
            if distance <= MAX_NEIGHBOR_KM:
                key = str(row["station_id"])
                previous = newest_nearby.get(key)
                if previous is None or age_hours < previous[1]:
                    newest_nearby[key] = (row, age_hours, distance)
        for row, age_hours, distance in newest_nearby.values():
            weight = exp(-distance / 35.0) * exp(-age_hours / 12.0)
            if isfinite(weight) and weight > 0:
                weighted.append((weight, float(row["error"])))
        if newest_nearby:
            nearest = min(newest_nearby.values(), key=lambda item: item[2])[0]
            result["nearest_station_persistence"] = float(nearest["observed_pm25"])
        if len(newest_nearby) >= 2 and weighted:
            result["spatial_residual"] = max(
                0.0,
                raw
                - sum(weight * error for weight, error in weighted)
                / sum(weight for weight, _ in weighted),
            )
    return result


def held_out_comparison(pairs: list[dict], cutoff: str, held_out_ids: set[str]) -> dict:
    """Compare later hours and wholly unseen stations without time leakage."""

    train = [
        row
        for row in pairs
        if _time(row["valid_at"]) < _time(cutoff)
        and row["station_id"] not in held_out_ids
    ]
    test = [row for row in pairs if _time(row["valid_at"]) >= _time(cutoff)]
    outputs: dict[str, dict[str, list[dict]]] = {
        "seen_stations": defaultdict(list),
        "held_out_stations": defaultdict(list),
    }
    examples: dict[str, dict[str, list[dict]]] = {
        "seen_stations": defaultdict(list),
        "held_out_stations": defaultdict(list),
    }
    for row in test:
        bucket = (
            "held_out_stations"
            if row["station_id"] in held_out_ids
            else "seen_stations"
        )
        predictions = candidate_predictions(
            row, train, held_out_station=bucket == "held_out_stations"
        )
        for name, value in predictions.items():
            if value is not None:
                outputs[bucket][name].append({**row, "prediction": value})
                if name != "raw":
                    examples[bucket][name].append(
                        {
                            "station_id": row["station_id"],
                            "valid_at": row["valid_at"],
                            "raw": predictions["raw"],
                            "adjusted": value,
                            "observed": row["observed_pm25"],
                            "absolute_error_improvement": abs(
                                float(predictions["raw"]) - float(row["observed_pm25"])
                            )
                            - abs(float(value) - float(row["observed_pm25"])),
                        }
                    )
    return {
        bucket: {
            "metrics": {name: aggregate(items) for name, items in methods.items()},
            "coverage": {
                name: len(items) / len(outputs[bucket]["raw"])
                if outputs[bucket]["raw"]
                else 0
                for name, items in methods.items()
            },
            "examples": {
                name: {
                    "improved": sorted(
                        items,
                        key=lambda row: row["absolute_error_improvement"],
                        reverse=True,
                    )[:3],
                    "worsened": sorted(
                        items, key=lambda row: row["absolute_error_improvement"]
                    )[:3],
                }
                for name, items in examples[bucket].items()
            },
        }
        for bucket, methods in outputs.items()
    }
