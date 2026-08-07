import csv
import hashlib
import json
from datetime import UTC, datetime, timedelta

import pytest

from backend.algorithms.forecast_features import FEATURE_VERSION
from backend.algorithms.forecast_quality import canonical_sha256
from scripts import train_forecast
from scripts.train_forecast import (
    _load_manifest,
    _load_rows,
    name_tree_features,
    train_horizon,
)


def test_training_loader_requires_matching_csv_and_manifest_hash(tmp_path):
    csv_path = tmp_path / "training.csv"
    with csv_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle, fieldnames=["station_id", "recorded_at", "pm25"]
        )
        writer.writeheader()
        writer.writerow(
            {"station_id": "A", "recorded_at": "2026-01-01T00:00:00Z", "pm25": 20}
        )
    manifest = {
        "feature_version": FEATURE_VERSION,
        "csv_sha256": hashlib.sha256(csv_path.read_bytes()).hexdigest(),
    }
    manifest["manifest_sha256"] = canonical_sha256(manifest)
    csv_path.with_suffix(".manifest.json").write_text(
        json.dumps(manifest), encoding="utf-8"
    )
    assert _load_manifest(csv_path)["feature_version"] == FEATURE_VERSION
    csv_path.write_text("tampered", encoding="utf-8")
    with pytest.raises(ValueError, match="dataset_csv_checksum_mismatch"):
        _load_manifest(csv_path)


def test_training_csv_loader_preserves_missing_values(tmp_path):
    csv_path = tmp_path / "training.csv"
    csv_path.write_text(
        "station_id,recorded_at,pm25,temperature\nA,2026-01-01T00:00:00Z,20,\n",
        encoding="utf-8",
    )
    rows = _load_rows(csv_path)
    assert rows["A"][0]["temperature"] is None


def test_tree_feature_names_are_expanded():
    tree = {
        "nodeid": 0,
        "split": "f1",
        "children": [{"nodeid": 1, "leaf": 2}],
    }
    assert name_tree_features(tree, ["a", "b"])["split"] == "b"


def test_training_pipeline_smoke_writes_checksum_verified_artifact(
    tmp_path, monkeypatch
):
    start = datetime(2026, 1, 1, tzinfo=UTC)
    rows = []
    for hour in range(180):
        rows.append(
            {
                "station_id": "A",
                "recorded_at": (start + timedelta(hours=hour)).isoformat(),
                "pm25": 22 + (hour % 24) * 0.2,
                "weather_status": "unavailable",
                "fire_status": "unavailable",
                "forecast_weather_status_h1": "unavailable",
            }
        )
    monkeypatch.setitem(train_forecast.MODEL_CONFIG, "n_estimators", 3)
    manifest = {
        "manifest_sha256": "a" * 64,
        "raw_completeness": 1.0,
    }
    result = train_horizon(
        horizon=1,
        rows_by_station={"A": rows},
        manifest=manifest,
        output=tmp_path,
        fold_count=2,
    )
    artifact = json.loads((tmp_path / "forecast_h1.json").read_text("utf-8"))
    unsigned = {
        key: value for key, value in artifact.items() if key != "artifact_sha256"
    }
    assert artifact["artifact_sha256"] == canonical_sha256(unsigned)
    assert artifact["feature_version"] == FEATURE_VERSION
    assert result["test_rows"] > 0
