import json

from backend.algorithms.forecast_features import FEATURE_VERSION
from backend.algorithms.forecast_quality import canonical_sha256
from backend.services import forecast_models
from scripts.register_forecast_models import candidates


def _passing_metrics() -> dict:
    return {
        "history_days": 100,
        "source_rows": 2000,
        "test_rows": 400,
        "station_count": 4,
        "observed_months": 6,
        "split_strategy": "per_station_rolling_origin_with_untouched_holdout",
        "rolling_fold_count": 4,
        "untouched_holdout": True,
        "feature_version": FEATURE_VERSION,
        "dataset_manifest_sha256": "d" * 64,
        "completeness": 0.9,
        "baseline_mae": 10,
        "model_mae": 9,
        "baseline_category_accuracy": 0.7,
        "model_category_accuracy": 0.72,
        "false_safe_gate_passed": True,
        "interval_coverage_target": 0.9,
        "interval_empirical_coverage": 0.88,
    }


def _artifact(version: str) -> dict:
    features = ["pm25_current"]
    calibration = {
        "version": f"cal-{version}",
        "coverage_target": 0.9,
        "minimum_slice_rows": 30,
        "slices": {
            "horizon:1": {
                "rows": 100,
                "lower_residual": -5,
                "upper_residual": 5,
            }
        },
    }
    calibration["calibration_sha256"] = canonical_sha256(calibration)
    artifact = {
        "schema_version": 2,
        "version": version,
        "horizon_hours": 1,
        "feature_version": FEATURE_VERSION,
        "feature_names": features,
        "feature_schema_sha256": canonical_sha256(
            {"version": FEATURE_VERSION, "features": features}
        ),
        "dataset_manifest_sha256": "d" * 64,
        "code_release_sha": "release-1",
        "base_score": 20,
        "trees": [{"nodeid": 0, "leaf": 1}],
        "calibration": calibration,
        "metrics": _passing_metrics(),
        "model_card": {"model_card_sha256": "c" * 64},
    }
    artifact["artifact_sha256"] = canonical_sha256(artifact)
    return artifact


def _registry(artifact: dict, *, updated_at: str = "1") -> dict:
    return {
        "activation_status": "active",
        "environment": forecast_models.settings.app_environment,
        "horizon_hours": 1,
        "version": artifact["version"],
        "feature_version": FEATURE_VERSION,
        "artifact_path": "forecast_h1.json",
        "artifact_sha256": artifact["artifact_sha256"],
        "feature_schema_sha256": artifact["feature_schema_sha256"],
        "dataset_manifest_sha256": artifact["dataset_manifest_sha256"],
        "code_release_sha": artifact["code_release_sha"],
        "updated_at": updated_at,
    }


def test_artifact_validation_rejects_tampering():
    artifact = _artifact("v1")
    assert forecast_models.validate_artifact(artifact, _registry(artifact), 1) is None
    artifact["trees"][0]["leaf"] = 999
    assert (
        forecast_models.validate_artifact(artifact, _registry(artifact), 1)
        == "artifact_checksum_mismatch"
    )


def test_registry_version_change_invalidates_artifact_cache(tmp_path, monkeypatch):
    monkeypatch.setattr(forecast_models, "ARTIFACT_DIR", tmp_path)
    monkeypatch.setattr(forecast_models.settings, "ml_forecast_enabled", True)
    first = _artifact("v1")
    current = _registry(first)
    (tmp_path / "forecast_h1.json").write_text(json.dumps(first), "utf-8")
    monkeypatch.setattr(
        forecast_models.supabase_client,
        "get_runtime_forecast_model",
        lambda _horizon, *, prefer_canary=False: current,
    )
    forecast_models.clear_artifact_cache()
    loaded, reason = forecast_models.active_artifact(1)
    assert reason is None
    assert loaded["version"] == "v1"

    second = _artifact("v2")
    current = _registry(second, updated_at="2")
    (tmp_path / "forecast_h1.json").write_text(json.dumps(second), "utf-8")
    loaded, reason = forecast_models.active_artifact(1)
    assert reason is None
    assert loaded["version"] == "v2"


def test_registry_must_be_runtime_authorized():
    artifact = _artifact("v1")
    registry = {**_registry(artifact), "activation_status": "candidate"}
    assert (
        forecast_models.validate_artifact(artifact, registry, 1)
        == "registry_model_not_active"
    )
    canary = {**_registry(artifact), "activation_status": "canary"}
    assert forecast_models.validate_artifact(artifact, canary, 1) is None
    shadow = {**_registry(artifact), "activation_status": "shadow"}
    assert forecast_models.validate_artifact(artifact, shadow, 1) is None


def test_registration_never_activates_and_rejects_corruption(tmp_path):
    artifact = _artifact("v1")
    (tmp_path / "forecast_h1.json").write_text(json.dumps(artifact), "utf-8")
    rows = candidates(tmp_path, environment="staging")
    assert rows[0]["registry"]["activation_status"] == "candidate"

    artifact["base_score"] = 999
    (tmp_path / "forecast_h1.json").write_text(json.dumps(artifact), "utf-8")
    rows = candidates(tmp_path, environment="staging")
    assert rows[0]["registry"]["activation_status"] == "rejected"
    assert "artifact_checksum_mismatch" in rows[0]["integrity_reasons"]
