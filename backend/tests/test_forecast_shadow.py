from backend.core.config import settings
from backend.services import forecasting, local_store


def test_shadow_predictions_are_ledgered_but_never_served(monkeypatch):
    monkeypatch.setattr(settings, "local_demo_mode", True)
    monkeypatch.setattr(settings, "ml_forecast_enabled", False)
    monkeypatch.setattr(settings, "ml_forecast_shadow_enabled", True)
    station_id = str(local_store.get_stations()[0]["id"])

    def shadow(horizon, _history, _inputs, *, data_quality):
        assert data_quality == "sufficient"
        return {
            "pm25": 44.0 + horizon,
            "lower": 30.0,
            "upper": 60.0,
            "version": "shadow-v1",
            "feature_version": "forecast-features-v2",
            "artifact_sha256": "a" * 64,
            "coverage_target": 0.9,
            "calibration_version": "shadow-cal-v1",
        }, None

    monkeypatch.setattr(forecasting, "predict_shadow_artifact", shadow)
    response, ledger = forecasting.station_forecast(station_id, 24)

    assert response["model_version"] is None
    assert all(point["model_version"] is None for point in response["points"])
    shadow_rows = [row for row in ledger["predictions"] if row["variant"] == "shadow"]
    assert [row["horizon_hours"] for row in shadow_rows] == [1, 3, 6, 12, 24]
    assert all(row["model_version"] == "shadow-v1" for row in shadow_rows)
