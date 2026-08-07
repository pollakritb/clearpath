"""Pure temporal split, slice evaluation and model-card helpers."""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Mapping, Sequence
from datetime import datetime

from .forecast_baselines import BANGKOK, evaluate_predictions
from .forecast_quality import canonical_sha256, parse_timestamp

ROLLING_SPLIT_STRATEGY = "per_station_rolling_origin_with_untouched_holdout"


def rolling_origin_plan(
    records: Sequence[Mapping[str, object]],
    *,
    fold_count: int = 4,
    holdout_fraction: float = 0.2,
    minimum_train_rows: int = 48,
) -> dict:
    """Build expanding per-station folds and a final untouched temporal holdout."""

    if fold_count < 2:
        raise ValueError("at_least_two_folds_required")
    if not 0.05 <= holdout_fraction <= 0.4:
        raise ValueError("holdout_fraction_out_of_range")
    by_station: dict[str, list[tuple[int, datetime]]] = defaultdict(list)
    for index, record in enumerate(records):
        try:
            timestamp = parse_timestamp(record.get("prediction_at"))
        except (TypeError, ValueError):
            continue
        by_station[str(record.get("station_id") or "")].append((index, timestamp))
    for values in by_station.values():
        values.sort(key=lambda item: item[1])

    development: dict[str, list[int]] = {}
    holdout_indices: list[int] = []
    excluded_stations: list[str] = []
    for station_id, values in sorted(by_station.items()):
        holdout_rows = max(1, round(len(values) * holdout_fraction))
        split = len(values) - holdout_rows
        if split < minimum_train_rows + fold_count:
            excluded_stations.append(station_id)
            continue
        holdout_start = values[split][1]
        development[station_id] = [
            index
            for index, _timestamp in values[:split]
            if parse_timestamp(records[index].get("target_at")) <= holdout_start
        ]
        holdout_indices.extend(index for index, _timestamp in values[split:])

    folds = []
    for fold_index in range(fold_count):
        train_indices: list[int] = []
        validation_indices: list[int] = []
        boundaries: dict[str, dict] = {}
        for station_id, indices in development.items():
            available_after_minimum = len(indices) - minimum_train_rows
            validation_size = max(1, available_after_minimum // (fold_count + 1))
            train_end = min(
                len(indices) - 1,
                minimum_train_rows + validation_size * fold_index,
            )
            validation_end = (
                len(indices)
                if fold_index == fold_count - 1
                else min(len(indices), train_end + validation_size)
            )
            train = indices[:train_end]
            validation = indices[train_end:validation_end]
            if not train or not validation:
                continue
            validation_start = parse_timestamp(
                records[validation[0]].get("prediction_at")
            )
            train = [
                index
                for index in train
                if parse_timestamp(records[index].get("target_at")) <= validation_start
            ]
            if not train:
                continue
            train_indices.extend(train)
            validation_indices.extend(validation)
            boundaries[station_id] = {
                "train_end": str(records[train[-1]]["prediction_at"]),
                "validation_start": str(records[validation[0]]["prediction_at"]),
                "validation_end": str(records[validation[-1]]["prediction_at"]),
            }
        if train_indices and validation_indices:
            folds.append(
                {
                    "fold": fold_index + 1,
                    "train_indices": sorted(train_indices),
                    "validation_indices": sorted(validation_indices),
                    "boundaries": boundaries,
                }
            )

    return {
        "strategy": ROLLING_SPLIT_STRATEGY,
        "fold_count": len(folds),
        "folds": folds,
        "development_indices": sorted(
            index for indices in development.values() for index in indices
        ),
        "holdout_indices": sorted(holdout_indices),
        "station_count": len(development),
        "excluded_stations": excluded_stations,
    }


def station_holdout_plans(
    records: Sequence[Mapping[str, object]],
) -> list[dict]:
    stations = sorted({str(record.get("station_id") or "") for record in records})
    return [
        {
            "held_out_station": station,
            "train_indices": [
                index
                for index, record in enumerate(records)
                if str(record.get("station_id") or "") != station
            ],
            "test_indices": [
                index
                for index, record in enumerate(records)
                if str(record.get("station_id") or "") == station
            ],
        }
        for station in stations
    ]


def _season(timestamp: str) -> str:
    month = parse_timestamp(timestamp).astimezone(BANGKOK).month
    return "rainy" if month in {5, 6, 7, 8, 9, 10} else "dry"


def _pm_band(value: float) -> str:
    if value <= 25:
        return "low"
    if value <= 75:
        return "elevated"
    return "high"


def sliced_metrics(
    records: Sequence[Mapping[str, object]],
    predictions: Sequence[float],
) -> dict:
    if len(records) != len(predictions):
        raise ValueError("prediction_lengths_invalid")
    buckets: dict[tuple[str, str], list[int]] = defaultdict(list)
    for index, record in enumerate(records):
        buckets[("all", "all")].append(index)
        buckets[("station", str(record.get("station_id") or "unknown"))].append(index)
        district = str(record.get("district") or "unknown")
        buckets[("district", district)].append(index)
        buckets[("season", _season(str(record["prediction_at"])))].append(index)
        buckets[("pm_band", _pm_band(float(record["target"])))].append(index)
    result: dict[str, dict] = {}
    for (dimension, value), indices in sorted(buckets.items()):
        actual = [float(records[index]["target"]) for index in indices]
        predicted = [float(predictions[index]) for index in indices]
        result[f"{dimension}:{value}"] = evaluate_predictions(actual, predicted)
    return result


def model_card(
    *,
    model_name: str,
    version: str,
    horizon_hours: int,
    feature_version: str,
    dataset_manifest_sha256: str,
    split_plan: Mapping[str, object],
    metrics: Mapping[str, object],
    limitations: Sequence[str],
) -> dict:
    card = {
        "model_name": model_name,
        "version": version,
        "horizon_hours": horizon_hours,
        "feature_version": feature_version,
        "dataset_manifest_sha256": dataset_manifest_sha256,
        "split_strategy": split_plan.get("strategy"),
        "fold_count": split_plan.get("fold_count"),
        "station_count": split_plan.get("station_count"),
        "metrics": metrics,
        "limitations": list(limitations),
        "human_approval_required": True,
    }
    card["model_card_sha256"] = canonical_sha256(card)
    return card
