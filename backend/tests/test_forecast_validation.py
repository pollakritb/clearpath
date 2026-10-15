import asyncio
from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

from backend.algorithms.forecast_validation import (
    collection_slot,
    provisional_metrics,
    select_cohort,
    validation_pairs,
)
from backend.core.config import settings
from backend.main import create_app
from backend.services import forecast_validation, openmeteo_air, supabase_client


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
            "window_start_at": "2026-10-15T05:00:00+00:00",
            "window_end_at": "2026-10-15T06:00:00+00:00",
            "timestamp_semantics_verified": True,
            "fetched_at": "2026-10-15T06:15:00+00:00",
        }
    ]
    pairs = validation_pairs(snapshots, observations)
    assert len(pairs) == 1
    assert provisional_metrics(pairs)["1-6h"] == {"count": 1, "mae": 5, "bias": -5}
    observations[0]["average_period_minutes"] = 1440
    assert validation_pairs(snapshots, observations) == []
    observations[0]["average_period_minutes"] = 60
    observations[0]["timestamp_semantics_verified"] = False
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


def test_validation_job_and_metrics_fail_closed_in_production(monkeypatch):
    monkeypatch.setattr(settings, "app_environment", "production")
    monkeypatch.setattr(settings, "forecast_validation_enabled", True)
    monkeypatch.setattr(settings, "forecast_validation_public_metrics_enabled", True)
    monkeypatch.setattr(settings, "cron_secret", "forecast-validation-test-token")
    client = TestClient(create_app())
    response = client.get(
        "/api/cron/forecast-validation",
        headers={"Authorization": "Bearer forecast-validation-test-token"},
    )
    assert response.json()["status"] == "disabled"
    summary = client.get("/api/forecast/validation-summary?station_id=103t")
    assert summary.status_code == 200
    assert summary.json()["available"] is False


def test_collector_retry_preserves_first_snapshot(monkeypatch):
    now = datetime.now(UTC)
    first_valid = now.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)
    readings = [
        {
            "forecast_at": (first_valid + timedelta(hours=index)).isoformat(),
            "fetched_at": now.isoformat(),
            "pm25": 12 + index,
            "source_lat": 12.6,
            "source_lon": 100.0,
        }
        for index in range(24)
    ]
    monkeypatch.setattr(
        supabase_client,
        "get_stations",
        lambda: [
            {
                "id": "103t",
                "lat": 12.577835,
                "lon": 99.953663,
                "recorded_at": now.isoformat(),
            }
        ],
    )

    async def forecasts(_locations, forecast_hours):
        assert forecast_hours == 28
        return {"103t": readings}

    monkeypatch.setattr(openmeteo_air, "get_forecasts", forecasts)
    stored = {}

    def insert(rows):
        added = 0
        for row in rows:
            key = row["station_id"], row["collection_slot"], row["valid_at"]
            if key not in stored:
                stored[key] = row.copy()
                added += 1
        return added

    monkeypatch.setattr(supabase_client, "upsert_forecast_validation_snapshots", insert)
    monkeypatch.setattr(
        supabase_client, "upsert_forecast_validation_collection_run", lambda _row: None
    )
    monkeypatch.setattr(
        supabase_client, "prune_forecast_validation_snapshots", lambda _cutoff: None
    )
    first = asyncio.run(forecast_validation.collect_snapshots())
    readings[0]["pm25"] = 999
    second = asyncio.run(forecast_validation.collect_snapshots())
    assert first["snapshot_count"] == 24
    assert second["snapshot_count"] == 0
    assert len(stored) == 24
    assert next(iter(stored.values()))["pm25"] == 12


def test_staging_collector_requires_reviewed_cohort(monkeypatch):
    monkeypatch.setattr(settings, "app_environment", "staging")
    monkeypatch.setattr(settings, "forecast_validation_cohort_ids", "")
    monkeypatch.setattr(supabase_client, "get_stations", lambda: [])
    result = asyncio.run(forecast_validation.collect_snapshots())
    assert result["status"] == "cohort_not_configured"
    assert result["snapshot_count"] == 0
