"""Load only activation-gated neutral forecast artifacts in production."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from ..algorithms.forecast_features import feature_vector
from ..algorithms.forecast_model import (
    evaluate_activation_gate,
    predict_neutral_artifact,
)
from ..core.config import settings

ARTIFACT_DIR = Path(__file__).resolve().parents[1] / "model_artifacts"


@lru_cache(maxsize=5)
def active_artifact(horizon_hours: int) -> tuple[dict | None, str | None]:
    if not settings.ml_forecast_enabled:
        return None, "ml_forecast_disabled"
    path = ARTIFACT_DIR / f"forecast_h{horizon_hours}.json"
    if not path.exists():
        return None, "artifact_not_found"
    try:
        artifact = json.loads(path.read_text(encoding="utf-8"))
        gate = evaluate_activation_gate(artifact.get("metrics") or {})
        if not gate["active"]:
            return None, ",".join(gate["reasons"])
        return artifact, None
    except (OSError, ValueError, TypeError, KeyError):
        return None, "artifact_invalid"


def predict_active_artifact(
    horizon_hours: int,
    history: list[dict],
    current_inputs: dict,
) -> tuple[dict | None, str | None]:
    artifact, reason = active_artifact(horizon_hours)
    if artifact is None:
        return None, reason
    if len(history) < 25:
        return None, "insufficient_history_for_ml"
    try:
        rows = [dict(row) for row in history]
        rows[-1].update(current_inputs)
        features = feature_vector(rows, len(rows) - 1)
        required = artifact.get("feature_names") or []
        if any(name not in features for name in required):
            return None, "required_features_missing"
        prediction = predict_neutral_artifact(artifact, features)
        return {
            "pm25": prediction,
            "lower": max(0.0, prediction + float(artifact["lower_residual"])),
            "upper": max(0.0, prediction + float(artifact["upper_residual"])),
            "version": str(artifact["version"]),
        }, None
    except (KeyError, TypeError, ValueError, IndexError):
        return None, "inference_failed"


def artifact_statuses() -> list[dict]:
    statuses = []
    for horizon in (1, 3, 6, 12, 24):
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
