"""Train audited direct-horizon XGBoost candidates with rolling backtests."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import xgboost as xgb

from backend.algorithms.forecast_baselines import (
    BANGKOK,
    BASELINE_METHODS,
    backtest_baselines,
    champion_baseline,
    evaluate_predictions,
    forecast_with_baseline,
)
from backend.algorithms.forecast_evaluation import (
    model_card,
    rolling_origin_plan,
    sliced_metrics,
    station_holdout_plans,
)
from backend.algorithms.forecast_features import FEATURE_VERSION, training_records
from backend.algorithms.forecast_model import (
    evaluate_activation_gate,
    predict_neutral_artifact,
)
from backend.algorithms.forecast_quality import (
    audit_point_in_time_examples,
    canonical_sha256,
    parse_timestamp,
)
from backend.algorithms.forecast_uncertainty import (
    apply_calibrated_interval,
    calibrate_residual_intervals,
    interval_metrics,
)

HORIZONS = (1, 3, 6, 12, 24)
MODEL_CONFIG = {
    "n_estimators": 300,
    "max_depth": 5,
    "learning_rate": 0.04,
    "subsample": 0.85,
    "colsample_bytree": 0.85,
    "objective": "reg:squarederror",
    "base_score": 0,
    "random_state": 42,
    "n_jobs": 1,
}


def name_tree_features(node: dict, feature_names: list[str]) -> dict:
    """Replace compact xgboost f0/f1 split names with contract field names."""

    split = node.get("split")
    if isinstance(split, str):
        raw_index = split[1:] if split.startswith("f") else split
        if raw_index.isdigit():
            node["split"] = feature_names[int(raw_index)]
    for child in node.get("children", []):
        name_tree_features(child, feature_names)
    return node


def _load_rows(csv_path: Path) -> dict[str, list[dict]]:
    rows_by_station: dict[str, list[dict]] = {}
    with csv_path.open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            if not row.get("station_id") or not row.get("recorded_at"):
                continue
            normalized = {
                key: (value if value != "" else None) for key, value in row.items()
            }
            rows_by_station.setdefault(str(row["station_id"]), []).append(normalized)
    for rows in rows_by_station.values():
        rows.sort(key=lambda item: str(item["recorded_at"]))
    return rows_by_station


def _load_manifest(csv_path: Path) -> dict:
    manifest_path = csv_path.with_suffix(".manifest.json")
    if not manifest_path.exists():
        raise ValueError("dataset_manifest_missing")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    expected_csv_sha = hashlib.sha256(csv_path.read_bytes()).hexdigest()
    if manifest.get("csv_sha256") != expected_csv_sha:
        raise ValueError("dataset_csv_checksum_mismatch")
    unsigned = {
        key: value for key, value in manifest.items() if key != "manifest_sha256"
    }
    if manifest.get("manifest_sha256") != canonical_sha256(unsigned):
        raise ValueError("dataset_manifest_checksum_mismatch")
    if manifest.get("feature_version") != FEATURE_VERSION:
        raise ValueError("dataset_feature_version_mismatch")
    return manifest


def _matrix(records: list[dict], indices: list[int], names: list[str]) -> np.ndarray:
    return np.asarray(
        [
            [float(records[index]["features"].get(name, np.nan)) for name in names]
            for index in indices
        ],
        dtype=float,
    )


def _targets(records: list[dict], indices: list[int]) -> np.ndarray:
    return np.asarray(
        [float(records[index]["target"]) for index in indices], dtype=float
    )


def _fit(
    records: list[dict],
    indices: list[int],
    names: list[str],
    config: dict | None = None,
) -> xgb.Booster:
    """Train with XGBoost's native API; no implicit scikit-learn dependency."""

    selected = config or MODEL_CONFIG
    params = {
        key: value
        for key, value in selected.items()
        if key not in {"n_estimators", "n_jobs"}
    }
    params["nthread"] = selected["n_jobs"]
    matrix = xgb.DMatrix(
        _matrix(records, indices, names),
        label=_targets(records, indices),
        feature_names=names,
    )
    return xgb.train(
        params,
        matrix,
        num_boost_round=int(selected["n_estimators"]),
    )


def _bounded_parameter_search(
    records: list[dict], first_fold: dict, names: list[str]
) -> tuple[dict, list[dict]]:
    """Select from a small deterministic budget on the earliest validation fold."""

    candidates = [
        dict(MODEL_CONFIG),
        {**MODEL_CONFIG, "max_depth": 3, "learning_rate": 0.06},
        {
            **MODEL_CONFIG,
            "max_depth": 6,
            "learning_rate": 0.03,
            "subsample": 0.75,
        },
    ]
    reports = []
    validation_indices = first_fold["validation_indices"]
    actual = _targets(records, validation_indices)
    for index, config in enumerate(candidates):
        model = _fit(records, first_fold["train_indices"], names, config)
        predicted = _predict(model, records, validation_indices, names)
        reports.append(
            {
                "candidate": index,
                "config": config,
                "validation": evaluate_predictions(actual.tolist(), predicted.tolist()),
            }
        )
    winner = min(reports, key=lambda report: report["validation"]["mae"])
    return dict(winner["config"]), reports


def _station_holdout_experiment(
    records: list[dict],
    development_indices: list[int],
    names: list[str],
    config: dict,
) -> list[dict]:
    """Measure generalization to each station without touching the final holdout."""

    development = [records[index] for index in development_indices]
    reports = []
    for split in station_holdout_plans(development):
        if not split["train_indices"] or not split["test_indices"]:
            continue
        model = _fit(development, split["train_indices"], names, config)
        predicted = _predict(model, development, split["test_indices"], names)
        actual = _targets(development, split["test_indices"])
        reports.append(
            {
                "held_out_station": split["held_out_station"],
                "train_rows": len(split["train_indices"]),
                "test_rows": len(split["test_indices"]),
                "metrics": evaluate_predictions(actual.tolist(), predicted.tolist()),
            }
        )
    return reports


def _predict(
    model: xgb.Booster,
    records: list[dict],
    indices: list[int],
    names: list[str],
) -> np.ndarray:
    return model.predict(
        xgb.DMatrix(_matrix(records, indices, names), feature_names=names)
    )


def _development_baselines(
    rows_by_station: dict[str, list[dict]],
    records: list[dict],
    development_indices: list[int],
    horizon: int,
) -> dict:
    end_by_station: dict[str, datetime] = {}
    for index in development_indices:
        record = records[index]
        station_id = str(record["station_id"])
        target_at = parse_timestamp(record["target_at"])
        end_by_station[station_id] = max(
            end_by_station.get(station_id, target_at), target_at
        )
    combined_actual: list[float] = []
    combined_predictions: dict[str, list[float]] = {
        method: [] for method in BASELINE_METHODS
    }
    for station_id, end_at in end_by_station.items():
        development_rows = [
            row
            for row in rows_by_station.get(station_id, [])
            if parse_timestamp(row.get("recorded_at")) <= end_at
        ]
        try:
            result = backtest_baselines(development_rows, horizon)
        except ValueError:
            continue
        combined_actual.extend(result["actual"])
        for method in BASELINE_METHODS:
            combined_predictions[method].extend(result["predictions"][method])
    if not combined_actual:
        raise ValueError("development_baseline_rows_missing")
    metrics = {
        method: evaluate_predictions(combined_actual, predictions)
        for method, predictions in combined_predictions.items()
    }
    return {"metrics": metrics, "champion": champion_baseline(metrics)}


def _baseline_predictions(
    rows_by_station: dict[str, list[dict]],
    records: list[dict],
    indices: list[int],
    *,
    method: str,
    horizon: int,
) -> np.ndarray:
    predictions = []
    for index in indices:
        record = records[index]
        prediction_at = parse_timestamp(record["prediction_at"])
        history = [
            row
            for row in rows_by_station[str(record["station_id"])]
            if parse_timestamp(row.get("recorded_at")) <= prediction_at
        ]
        result = forecast_with_baseline(method, history, horizon)
        predictions.append(float(result["points"][-1]["pm25"]))
    return np.asarray(predictions, dtype=float)


def _season(timestamp: str) -> str:
    month = parse_timestamp(timestamp).astimezone(BANGKOK).month
    return "rainy" if month in {5, 6, 7, 8, 9, 10} else "dry"


def train_horizon(
    *,
    horizon: int,
    rows_by_station: dict[str, list[dict]],
    manifest: dict,
    output: Path,
    fold_count: int,
) -> dict:
    records: list[dict] = []
    excluded: Counter[str] = Counter()
    for station_rows in rows_by_station.values():
        station_records, station_excluded = training_records(station_rows, horizon)
        records.extend(station_records)
        excluded.update(station_excluded)
    records.sort(key=lambda record: (record["prediction_at"], record["station_id"]))
    leakage = audit_point_in_time_examples(records)
    if not leakage["passed"]:
        raise ValueError("point_in_time_audit_failed")
    plan = rolling_origin_plan(records, fold_count=fold_count)
    if plan["fold_count"] < 2 or not plan["holdout_indices"]:
        raise ValueError("rolling_origin_rows_insufficient")

    feature_names = sorted(records[0]["features"])
    selected_config, search_report = _bounded_parameter_search(
        records, plan["folds"][0], feature_names
    )
    baseline = _development_baselines(
        rows_by_station,
        records,
        plan["development_indices"],
        horizon,
    )
    champion = str(baseline["champion"])
    fold_reports = []
    calibration_rows = []
    fold_predictions = []
    for fold in plan["folds"]:
        model = _fit(records, fold["train_indices"], feature_names, selected_config)
        validation_indices = fold["validation_indices"]
        predicted = _predict(model, records, validation_indices, feature_names)
        actual = _targets(records, validation_indices)
        baseline_predicted = _baseline_predictions(
            rows_by_station,
            records,
            validation_indices,
            method=champion,
            horizon=horizon,
        )
        model_metrics = evaluate_predictions(actual.tolist(), predicted.tolist())
        baseline_metrics = evaluate_predictions(
            actual.tolist(), baseline_predicted.tolist()
        )
        fold_reports.append(
            {
                "fold": fold["fold"],
                "train_rows": len(fold["train_indices"]),
                "validation_rows": len(validation_indices),
                "model": model_metrics,
                "baseline": baseline_metrics,
                "boundaries": fold["boundaries"],
            }
        )
        for position, record_index in enumerate(validation_indices):
            record = records[record_index]
            item = {
                "fold": fold["fold"],
                "station_id": record["station_id"],
                "prediction_at": record["prediction_at"],
                "target_at": record["target_at"],
                "actual": float(actual[position]),
                "predicted": float(predicted[position]),
                "baseline": float(baseline_predicted[position]),
                "horizon_hours": horizon,
                "season": _season(str(record["prediction_at"])),
            }
            calibration_rows.append(item)
            fold_predictions.append(item)

    version = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    calibration = calibrate_residual_intervals(
        calibration_rows,
        version=f"{version}-h{horizon}",
    )
    station_holdout = _station_holdout_experiment(
        records, plan["development_indices"], feature_names, selected_config
    )
    final_model = _fit(
        records, plan["development_indices"], feature_names, selected_config
    )
    holdout_indices = plan["holdout_indices"]
    holdout_predicted = _predict(final_model, records, holdout_indices, feature_names)
    holdout_actual = _targets(records, holdout_indices)
    holdout_baseline = _baseline_predictions(
        rows_by_station,
        records,
        holdout_indices,
        method=champion,
        horizon=horizon,
    )
    model_metrics = evaluate_predictions(
        holdout_actual.tolist(), holdout_predicted.tolist()
    )
    baseline_metrics = evaluate_predictions(
        holdout_actual.tolist(), holdout_baseline.tolist()
    )
    interval_rows = [
        apply_calibrated_interval(
            float(holdout_predicted[position]),
            calibration,
            horizon_hours=horizon,
            station_id=str(records[record_index]["station_id"]),
            season=_season(str(records[record_index]["prediction_at"])),
        )
        for position, record_index in enumerate(holdout_indices)
    ]
    coverage = interval_metrics(
        holdout_actual.tolist(),
        [row["lower"] for row in interval_rows],
        [row["upper"] for row in interval_rows],
    )
    holdout_records = [records[index] for index in holdout_indices]
    slices = sliced_metrics(holdout_records, holdout_predicted.tolist())
    raw_importance = final_model.get_score(importance_type="gain")
    importance_total = sum(float(value) for value in raw_importance.values())
    feature_importance = (
        {
            name: round(float(value) / importance_total, 8)
            for name, value in sorted(
                raw_importance.items(), key=lambda item: float(item[1]), reverse=True
            )
        }
        if importance_total
        else {}
    )
    all_times = [parse_timestamp(record["prediction_at"]) for record in records]
    metrics = {
        "train_start": min(all_times).isoformat(),
        "train_end": max(all_times).isoformat(),
        "history_days": (max(all_times) - min(all_times)).total_seconds() / 86400,
        "source_rows": len(records),
        "train_rows": len(plan["development_indices"]),
        "test_rows": len(holdout_indices),
        "station_count": plan["station_count"],
        "observed_months": len({(item.year, item.month) for item in all_times}),
        "split_strategy": plan["strategy"],
        "rolling_fold_count": plan["fold_count"],
        "untouched_holdout": True,
        "feature_version": FEATURE_VERSION,
        "dataset_manifest_sha256": manifest["manifest_sha256"],
        "completeness": float(manifest["raw_completeness"]),
        "baseline_name": champion,
        "baseline_mae": baseline_metrics["mae"],
        "model_mae": model_metrics["mae"],
        "baseline_category_accuracy": baseline_metrics["category_accuracy"],
        "model_category_accuracy": model_metrics["category_accuracy"],
        "baseline_false_safe_rate": baseline_metrics["false_safe_rate"],
        "model_false_safe_rate": model_metrics["false_safe_rate"],
        "false_safe_gate_passed": model_metrics["false_safe_rate"]
        <= baseline_metrics["false_safe_rate"] + 0.02,
        "interval_coverage_target": calibration["coverage_target"],
        "interval_empirical_coverage": coverage["empirical_coverage"],
        "mean_interval_width": coverage["mean_interval_width"],
        "baseline_leaderboard": baseline["metrics"],
        "rolling_folds": fold_reports,
        "hyperparameter_search": search_report,
        "station_holdout": station_holdout,
        "feature_importance_gain": feature_importance,
        "holdout_model_metrics": model_metrics,
        "holdout_baseline_metrics": baseline_metrics,
        "holdout_slices": slices,
        "excluded_reasons": dict(sorted(excluded.items())),
    }
    trees = [
        name_tree_features(json.loads(tree), feature_names)
        for tree in final_model.get_dump(dump_format="json")
    ]
    horizon_slice = calibration["slices"][f"horizon:{horizon}"]
    card = model_card(
        model_name="clearpath-xgboost",
        version=version,
        horizon_hours=horizon,
        feature_version=FEATURE_VERSION,
        dataset_manifest_sha256=str(manifest["manifest_sha256"]),
        split_plan=plan,
        metrics=metrics,
        limitations=[
            "Human approval, shadow evaluation and canary rollout are required.",
            "Community evidence is not used as a private training feature.",
            "Multi-season claims require separate field evidence.",
        ],
    )
    artifact = {
        "schema_version": 2,
        "version": version,
        "model_name": "clearpath-xgboost",
        "horizon_hours": horizon,
        "feature_version": FEATURE_VERSION,
        "feature_names": feature_names,
        "feature_schema_sha256": canonical_sha256(
            {"version": FEATURE_VERSION, "features": feature_names}
        ),
        "dataset_manifest_sha256": manifest["manifest_sha256"],
        "code_release_sha": os.environ.get("RELEASE_SHA", "uncommitted"),
        "training_config": selected_config,
        "base_score": 0,
        "trees": trees,
        "calibration": calibration,
        "lower_residual": horizon_slice["lower_residual"],
        "upper_residual": horizon_slice["upper_residual"],
        "metrics": metrics,
        "gate": evaluate_activation_gate(metrics),
        "model_card": card,
        "human_approval_required": True,
    }
    artifact["artifact_sha256"] = canonical_sha256(artifact)
    parity = np.asarray(
        [
            predict_neutral_artifact(artifact, records[index]["features"])
            for index in holdout_indices
        ]
    )
    if not np.allclose(parity, holdout_predicted, atol=1e-5):
        raise RuntimeError(f"neutral artifact parity failed for horizon {horizon}")

    output.mkdir(parents=True, exist_ok=True)
    artifact_path = output / f"forecast_h{horizon}.json"
    artifact_path.write_text(
        json.dumps(
            artifact, ensure_ascii=False, separators=(",", ":"), allow_nan=False
        ),
        encoding="utf-8",
    )
    (output / f"forecast_h{horizon}.model-card.json").write_text(
        json.dumps(card, ensure_ascii=False, indent=2, sort_keys=True),
        encoding="utf-8",
    )
    (output / f"forecast_h{horizon}.backtest.json").write_text(
        json.dumps(
            {
                "horizon_hours": horizon,
                "split_plan": plan,
                "fold_predictions": fold_predictions,
                "metrics": metrics,
                "calibration": calibration,
            },
            ensure_ascii=False,
            indent=2,
            sort_keys=True,
        ),
        encoding="utf-8",
    )
    return {
        "horizon_hours": horizon,
        "artifact": str(artifact_path),
        "artifact_sha256": artifact["artifact_sha256"],
        "gate": artifact["gate"],
        "test_rows": len(holdout_indices),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("csv_path", type=Path)
    parser.add_argument("--output", type=Path, default=Path("backend/model_artifacts"))
    parser.add_argument("--folds", type=int, default=4)
    args = parser.parse_args()
    manifest = _load_manifest(args.csv_path)
    rows_by_station = _load_rows(args.csv_path)
    results = []
    failures = []
    for horizon in HORIZONS:
        try:
            results.append(
                train_horizon(
                    horizon=horizon,
                    rows_by_station=rows_by_station,
                    manifest=manifest,
                    output=args.output,
                    fold_count=args.folds,
                )
            )
        except (RuntimeError, ValueError) as exc:
            failures.append({"horizon_hours": horizon, "reason": str(exc)})
    print(
        json.dumps(
            {"trained": results, "failed": failures}, ensure_ascii=False, indent=2
        )
    )
    return 0 if results and not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
