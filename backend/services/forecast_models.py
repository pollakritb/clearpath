"""Registry-authorized, checksum-verified forecast artifact inference."""

from __future__ import annotations

import json
import math
from functools import lru_cache
from pathlib import Path

from ..algorithms.forecast_baselines import BANGKOK
from ..algorithms.forecast_features import FEATURE_VERSION, feature_vector
from ..algorithms.forecast_model import (
    evaluate_activation_gate,
    predict_neutral_artifact,
)
from ..algorithms.forecast_monitoring import canary_eligible
from ..algorithms.forecast_quality import canonical_sha256, parse_timestamp
from ..algorithms.forecast_uncertainty import apply_calibrated_interval
from ..core.config import settings
from . import supabase_client

ARTIFACT_DIR = Path(__file__).resolve().parents[1] / "model_artifacts"
SUPPORTED_HORIZONS = (1, 3, 6, 12, 24)


def _tree_schema_valid(node: object, feature_names: set[str]) -> bool:
    if not isinstance(node, dict) or not isinstance(node.get("nodeid"), int):
        return False
    if "leaf" in node:
        try:
            return math.isfinite(float(node["leaf"]))
        except (TypeError, ValueError):
            return False
    if str(node.get("split")) not in feature_names:
        return False
    try:
        float(node["split_condition"])
        child_ids = {int(node[name]) for name in ("yes", "no", "missing")}
    except (KeyError, TypeError, ValueError):
        return False
    children = node.get("children")
    if not isinstance(children, list) or len(children) < 2:
        return False
    available_ids = {
        int(child["nodeid"])
        for child in children
        if isinstance(child, dict) and "nodeid" in child
    }
    return child_ids.issubset(available_ids) and all(
        _tree_schema_valid(child, feature_names) for child in children
    )


def validate_artifact(
    artifact: dict,
    registry: dict,
    horizon_hours: int,
) -> str | None:
    """Return a stable rejection code, or ``None`` when integrity is valid."""

    if registry.get("activation_status") not in {"active", "canary", "shadow"}:
        return "registry_model_not_active"
    if str(registry.get("environment")) != settings.app_environment:
        return "registry_environment_mismatch"
    if int(registry.get("horizon_hours", -1)) != horizon_hours:
        return "registry_horizon_mismatch"
    if int(artifact.get("schema_version", -1)) != 2:
        return "artifact_schema_unsupported"
    if int(artifact.get("horizon_hours", -1)) != horizon_hours:
        return "artifact_horizon_mismatch"
    if str(artifact.get("version")) != str(registry.get("version")):
        return "artifact_version_mismatch"
    if artifact.get("feature_version") != FEATURE_VERSION:
        return "artifact_feature_version_mismatch"
    if artifact.get("feature_version") != registry.get("feature_version"):
        return "registry_feature_version_mismatch"

    unsigned = {
        key: value for key, value in artifact.items() if key != "artifact_sha256"
    }
    actual_artifact_sha = canonical_sha256(unsigned)
    if artifact.get("artifact_sha256") != actual_artifact_sha:
        return "artifact_checksum_mismatch"
    if registry.get("artifact_sha256") != actual_artifact_sha:
        return "registry_artifact_checksum_mismatch"

    feature_names = artifact.get("feature_names")
    if not isinstance(feature_names, list) or not feature_names:
        return "artifact_feature_schema_invalid"
    if len(set(feature_names)) != len(feature_names) or not all(
        isinstance(name, str) and name for name in feature_names
    ):
        return "artifact_feature_schema_invalid"
    feature_sha = canonical_sha256(
        {"version": FEATURE_VERSION, "features": feature_names}
    )
    if artifact.get("feature_schema_sha256") != feature_sha:
        return "feature_schema_checksum_mismatch"
    if registry.get("feature_schema_sha256") != feature_sha:
        return "registry_feature_schema_checksum_mismatch"
    if artifact.get("dataset_manifest_sha256") != registry.get(
        "dataset_manifest_sha256"
    ):
        return "dataset_manifest_checksum_mismatch"
    if artifact.get("code_release_sha") != registry.get("code_release_sha"):
        return "code_release_mismatch"

    trees = artifact.get("trees")
    if (
        not isinstance(trees, list)
        or not trees
        or not all(_tree_schema_valid(tree, set(feature_names)) for tree in trees)
    ):
        return "artifact_tree_schema_invalid"
    calibration = artifact.get("calibration")
    if not isinstance(calibration, dict):
        return "artifact_calibration_missing"
    calibration_unsigned = {
        key: value for key, value in calibration.items() if key != "calibration_sha256"
    }
    if calibration.get("calibration_sha256") != canonical_sha256(calibration_unsigned):
        return "calibration_checksum_mismatch"
    gate = evaluate_activation_gate(artifact.get("metrics") or {})
    if not gate["active"]:
        return "artifact_quality_gate_failed"
    return None


@lru_cache(maxsize=20)
def _load_verified_artifact(
    horizon_hours: int,
    environment: str,
    version: str,
    artifact_sha256: str,
    feature_schema_sha256: str,
    dataset_manifest_sha256: str,
    code_release_sha: str,
    feature_version: str,
    artifact_filename: str,
    registry_updated_at: str,
    activation_status: str,
) -> tuple[dict | None, str | None]:
    del registry_updated_at  # Included in the cache key for same-version rollback.
    path = ARTIFACT_DIR / Path(artifact_filename).name
    if not path.exists():
        return None, "artifact_not_found"
    try:
        artifact = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError, TypeError):
        return None, "artifact_invalid_json"
    registry = {
        "activation_status": activation_status,
        "environment": environment,
        "horizon_hours": horizon_hours,
        "version": version,
        "artifact_sha256": artifact_sha256,
        "feature_schema_sha256": feature_schema_sha256,
        "dataset_manifest_sha256": dataset_manifest_sha256,
        "code_release_sha": code_release_sha,
        "feature_version": feature_version,
    }
    reason = validate_artifact(artifact, registry, horizon_hours)
    return (None, reason) if reason else (artifact, None)


def clear_artifact_cache() -> None:
    _load_verified_artifact.cache_clear()


def active_artifact(
    horizon_hours: int, station_id: str | None = None
) -> tuple[dict | None, str | None]:
    if not settings.ml_forecast_enabled:
        return None, "ml_forecast_disabled"
    if horizon_hours not in SUPPORTED_HORIZONS:
        return None, "unsupported_horizon"
    prefer_canary = bool(
        station_id
        and canary_eligible(
            station_id,
            percentage=settings.ml_forecast_canary_percentage,
            allowlist=settings.canary_station_allowlist,
        )
    )
    try:
        registry = supabase_client.get_runtime_forecast_model(
            horizon_hours, prefer_canary=prefer_canary
        )
    except Exception:
        return None, "model_registry_unavailable"
    if not registry:
        return None, "no_active_registry_model"
    required = (
        "activation_status",
        "environment",
        "version",
        "artifact_sha256",
        "feature_schema_sha256",
        "dataset_manifest_sha256",
        "code_release_sha",
        "feature_version",
        "artifact_path",
    )
    if any(not registry.get(name) for name in required):
        return None, "model_registry_integrity_incomplete"
    return _load_verified_artifact(
        horizon_hours,
        str(registry["environment"]),
        str(registry["version"]),
        str(registry["artifact_sha256"]),
        str(registry["feature_schema_sha256"]),
        str(registry["dataset_manifest_sha256"]),
        str(registry["code_release_sha"]),
        str(registry["feature_version"]),
        str(registry["artifact_path"]),
        str(registry.get("updated_at") or ""),
        str(registry.get("activation_status") or ""),
    )


def shadow_artifact(horizon_hours: int) -> tuple[dict | None, str | None]:
    """Load a registry shadow artifact without making it eligible to serve."""

    if not settings.ml_forecast_shadow_enabled:
        return None, "ml_forecast_shadow_disabled"
    if horizon_hours not in SUPPORTED_HORIZONS:
        return None, "unsupported_horizon"
    try:
        registry = supabase_client.get_shadow_forecast_model(horizon_hours)
    except Exception:
        return None, "model_registry_unavailable"
    if not registry:
        return None, "no_shadow_registry_model"
    required = (
        "activation_status",
        "environment",
        "version",
        "artifact_sha256",
        "feature_schema_sha256",
        "dataset_manifest_sha256",
        "code_release_sha",
        "feature_version",
        "artifact_path",
    )
    if any(not registry.get(name) for name in required):
        return None, "model_registry_integrity_incomplete"
    return _load_verified_artifact(
        horizon_hours,
        str(registry["environment"]),
        str(registry["version"]),
        str(registry["artifact_sha256"]),
        str(registry["feature_schema_sha256"]),
        str(registry["dataset_manifest_sha256"]),
        str(registry["code_release_sha"]),
        str(registry["feature_version"]),
        str(registry["artifact_path"]),
        str(registry.get("updated_at") or ""),
        "shadow",
    )


def _predict_artifact(
    artifact: dict | None,
    reason: str | None,
    horizon_hours: int,
    history: list[dict],
    current_inputs: dict,
    data_quality: str,
) -> tuple[dict | None, str | None]:
    if artifact is None:
        return None, reason
    if len(history) < 25:
        return None, "insufficient_history_for_ml"
    try:
        rows = [dict(row) for row in history]
        rows[-1].update(current_inputs)
        features = feature_vector(rows, len(rows) - 1, horizon_hours=horizon_hours)
        required = artifact["feature_names"]
        if any(name not in features for name in required):
            return None, "required_features_missing"
        prediction = max(0.0, min(1000.0, predict_neutral_artifact(artifact, features)))
        local_month = parse_timestamp(rows[-1]["recorded_at"]).astimezone(BANGKOK).month
        season = "rainy" if local_month in {5, 6, 7, 8, 9, 10} else "dry"
        interval = apply_calibrated_interval(
            prediction,
            artifact["calibration"],
            horizon_hours=horizon_hours,
            station_id=str(current_inputs.get("station_id") or ""),
            season=season,
            data_quality=data_quality,
        )
        return {
            "pm25": prediction,
            "lower": max(0.0, min(1000.0, float(interval["lower"]))),
            "upper": max(0.0, min(1000.0, float(interval["upper"]))),
            "version": str(artifact["version"]),
            "feature_version": str(artifact["feature_version"]),
            "artifact_sha256": str(artifact["artifact_sha256"]),
            "coverage_target": float(interval["coverage_target"]),
            "calibration_version": str(interval["calibration_version"]),
        }, None
    except (KeyError, TypeError, ValueError, IndexError, OverflowError):
        return None, "inference_failed"


def predict_active_artifact(
    horizon_hours: int,
    history: list[dict],
    current_inputs: dict,
    *,
    data_quality: str = "sufficient",
) -> tuple[dict | None, str | None]:
    station_id = str(current_inputs.get("station_id") or "")
    artifact, reason = active_artifact(horizon_hours, station_id)
    return _predict_artifact(
        artifact, reason, horizon_hours, history, current_inputs, data_quality
    )


def predict_shadow_artifact(
    horizon_hours: int,
    history: list[dict],
    current_inputs: dict,
    *,
    data_quality: str = "sufficient",
) -> tuple[dict | None, str | None]:
    artifact, reason = shadow_artifact(horizon_hours)
    return _predict_artifact(
        artifact, reason, horizon_hours, history, current_inputs, data_quality
    )


def artifact_statuses() -> list[dict]:
    statuses = []
    for horizon in SUPPORTED_HORIZONS:
        artifact, reason = active_artifact(horizon)
        statuses.append(
            {
                "horizon_hours": horizon,
                "active": artifact is not None,
                "version": str(artifact.get("version")) if artifact else None,
                "metrics": artifact.get("metrics") if artifact else None,
                "reason": reason,
            }
        )
    return statuses
