"""Train gated direct-horizon XGBoost models from a prepared hourly CSV.

Expected columns: station_id, recorded_at, pm25 and optional weather/fire
feature columns used by ``backend.algorithms.forecast_features``.
"""

from __future__ import annotations

import argparse
import csv
import json
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import xgboost as xgb

from backend.algorithms.forecast_features import training_examples
from backend.algorithms.forecast_model import (
    evaluate_activation_gate,
    predict_neutral_artifact,
)

HORIZONS = (1, 3, 6, 12, 24)


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


def category(value: float) -> int:
    return sum(value > threshold for threshold in (15, 25, 37.5, 75))


def accuracy(actual: np.ndarray, predicted: np.ndarray) -> float:
    return float(
        np.mean(
            [
                category(float(a)) == category(float(p))
                for a, p in zip(actual, predicted, strict=True)
            ]
        )
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("csv_path", type=Path)
    parser.add_argument("--output", type=Path, default=Path("backend/model_artifacts"))
    args = parser.parse_args()
    rows_by_station: dict[str, list[dict]] = {}
    with args.csv_path.open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            if (
                not row.get("station_id")
                or not row.get("recorded_at")
                or not row.get("pm25")
            ):
                continue
            normalized = {key: value for key, value in row.items()}
            normalized["pm25"] = float(row["pm25"])
            rows_by_station.setdefault(row["station_id"], []).append(normalized)
    for rows in rows_by_station.values():
        rows.sort(key=lambda item: item["recorded_at"])
    args.output.mkdir(parents=True, exist_ok=True)

    for horizon in HORIZONS:
        feature_rows: list[dict] = []
        targets: list[float] = []
        persistence: list[float] = []
        all_times: list[datetime] = []
        for rows in rows_by_station.values():
            x_rows, y_rows = training_examples(rows, horizon)
            feature_rows.extend(x_rows)
            targets.extend(y_rows)
            persistence.extend(item["pm25_lag_1"] for item in x_rows)
            all_times.extend(
                datetime.fromisoformat(str(row["recorded_at"]).replace("Z", "+00:00"))
                for row in rows[24 : 24 + len(x_rows)]
            )
        if len(feature_rows) < 10:
            continue
        names = sorted(feature_rows[0])
        matrix = np.array(
            [[row[name] for name in names] for row in feature_rows], dtype=float
        )
        target = np.array(targets, dtype=float)
        split = max(1, int(len(target) * 0.8))
        model = xgb.XGBRegressor(
            n_estimators=300,
            max_depth=5,
            learning_rate=0.04,
            subsample=0.85,
            colsample_bytree=0.85,
            objective="reg:squarederror",
            base_score=0,
            random_state=42,
        )
        model.fit(matrix[:split], target[:split])
        predicted = model.predict(matrix[split:])
        actual = target[split:]
        baseline = np.array(persistence[split:], dtype=float)
        residual = actual - predicted
        trees = [
            name_tree_features(json.loads(tree), names)
            for tree in model.get_booster().get_dump(dump_format="json")
        ]
        history_days = (
            (max(all_times) - min(all_times)).total_seconds() / 86400
            if all_times
            else 0
        )
        expected = max(1, int(history_days * 24 * max(1, len(rows_by_station))))
        metrics = {
            "history_days": history_days,
            "source_rows": len(target),
            "completeness": min(1.0, len(target) / expected),
            "baseline_mae": float(np.mean(np.abs(actual - baseline))),
            "model_mae": float(np.mean(np.abs(actual - predicted))),
            "baseline_category_accuracy": accuracy(actual, baseline),
            "model_category_accuracy": accuracy(actual, predicted),
        }
        artifact = {
            "version": datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ"),
            "horizon_hours": horizon,
            "base_score": 0,
            "feature_names": names,
            "trees": trees,
            "lower_residual": float(np.quantile(residual, 0.05)),
            "upper_residual": float(np.quantile(residual, 0.95)),
            "metrics": metrics,
            "gate": evaluate_activation_gate(metrics),
        }
        parity = np.array(
            [predict_neutral_artifact(artifact, row) for row in feature_rows[split:]]
        )
        if not np.allclose(parity, predicted, atol=1e-5):
            raise RuntimeError(f"neutral artifact parity failed for horizon {horizon}")
        (args.output / f"forecast_h{horizon}.json").write_text(
            json.dumps(artifact, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )


if __name__ == "__main__":
    main()
