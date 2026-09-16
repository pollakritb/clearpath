from __future__ import annotations

from datetime import UTC, datetime

from backend.core.config import settings
from backend.services import forecast_monitoring


def _row(horizon: int, pm25: float, state: str, version: str | None = "model-v1"):
    return {
        "horizon_hours": horizon,
        "pm25": pm25,
        "model_version": version,
        "forecast_runs": {
            "feature_quality": {
                "optional_feature_states": {"weather": state, "fire": "observed"}
            }
        },
    }


def test_missingness_counts_only_declared_features():
    result = forecast_monitoring._missingness(
        [_row(1, 10, "observed"), _row(1, 12, "missing"), {"forecast_runs": {}}]
    )
    assert result == {"weather": 0.5, "fire": 0.0}


def test_drift_snapshot_persists_supported_horizons_and_flags_alerts(monkeypatch):
    reference = [_row(1, 10, "observed") for _ in range(30)]
    current = [_row(1, 30, "missing") for _ in range(30)]
    calls = 0

    def monitoring_rows(_start: str, _end: str):
        nonlocal calls
        calls += 1
        return reference if calls == 1 else current

    persisted: list[dict] = []
    monkeypatch.setattr(settings, "app_environment", "production")
    monkeypatch.setattr(
        forecast_monitoring.supabase_client,
        "list_forecast_monitoring_rows",
        monitoring_rows,
    )
    monkeypatch.setattr(
        forecast_monitoring.supabase_client,
        "insert_forecast_drift_snapshots",
        lambda rows: persisted.extend(rows),
    )
    monkeypatch.setattr(
        forecast_monitoring,
        "population_stability_index",
        lambda _old, _new: {"drifted": True, "psi": 0.5},
    )
    monkeypatch.setattr(
        forecast_monitoring,
        "missingness_drift",
        lambda _old, _new: {"drifted": True, "maximum_delta": 1.0},
    )

    result = forecast_monitoring.run_drift_snapshot(
        now=datetime(2026, 9, 16, tzinfo=UTC)
    )

    assert result["snapshots"] == 1
    assert result["alerts"] == 1
    assert result["alert_codes"] == [
        "feature_missingness_drift",
        "prediction_psi_high",
    ]
    assert len(result["insufficient"]) == 4
    assert persisted[0]["model_version"] == "model-v1"
    assert persisted[0]["missingness"]["current"]["weather"] == 1.0
