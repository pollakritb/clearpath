from datetime import UTC, datetime

from fastapi.testclient import TestClient

from backend.algorithms.forecast_validation import (
    collection_slot,
    provisional_metrics,
    select_cohort,
    validation_pairs,
)
from backend.core.config import settings
from backend.main import create_app


def test_cohort_is_deterministic_and_contains_103t():
    rows = [
        {"id": "103t", "lat": 13.8, "lon": 100.1},
        {"id": "north", "lat": 19.5, "lon": 99},
        {"id": "south", "lat": 7, "lon": 100},
    ]
    assert [row["id"] for row in select_cohort(rows, 3)] == [
        "103t",
        "south",
        "north",
    ]
    assert (
        collection_slot(datetime(2026, 10, 15, 11, 30, tzinfo=UTC)).isoformat()
        == "2026-10-15T06:00:00+00:00"
    )


def test_pairing_requires_official_hourly_and_prior_forecast():
    snapshots = [
        {
            "station_id": "103t",
            "fetched_at": "2026-10-15T05:10:00+00:00",
            "valid_at": "2026-10-15T06:00:00Z",
            "pm25": 10,
        },
        {
            "station_id": "103t",
            "fetched_at": "2026-10-15T06:10:00+00:00",
            "valid_at": "2026-10-15T06:00:00+00:00",
            "pm25": 30,
        },
    ]
    observations = [
        {
            "station_id": "103t",
            "valid_at": "2026-10-15T06:00:00+00:00",
            "pm25": 15,
            "average_period_minutes": 60,
            "source": "air4thai_official_hourly",
        }
    ]
    pairs = validation_pairs(snapshots, observations)
    assert len(pairs) == 1
    assert provisional_metrics(pairs)["1-6h"] == {"count": 1, "mae": 5, "bias": -5}
    observations[0]["average_period_minutes"] = 1440
    assert validation_pairs(snapshots, observations) == []


def test_validation_job_stays_off_by_default(monkeypatch):
    monkeypatch.setattr(settings, "local_demo_mode", True)
    monkeypatch.setattr(settings, "forecast_validation_enabled", False)
    monkeypatch.setattr(settings, "cron_secret", "forecast-validation-test-token")
    response = TestClient(create_app()).get(
        "/api/cron/forecast-validation",
        headers={"Authorization": "Bearer forecast-validation-test-token"},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "disabled"
