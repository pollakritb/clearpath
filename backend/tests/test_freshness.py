from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

from backend.algorithms.freshness import station_freshness
from backend.main import create_app
from backend.routers import pm25


def test_station_freshness_surface_cutoff():
    now = datetime(2026, 7, 17, 12, tzinfo=UTC)
    fresh = station_freshness((now - timedelta(minutes=60)).isoformat(), now)
    delayed = station_freshness((now - timedelta(minutes=90)).isoformat(), now)
    expired = station_freshness(
        (now - timedelta(minutes=90, seconds=1)).isoformat(), now
    )
    assert fresh["data_status"] == "fresh"
    assert fresh["eligible_for_surface"] is True
    assert delayed["data_status"] == "delayed"
    assert delayed["eligible_for_surface"] is True
    assert expired["eligible_for_surface"] is False


def test_station_freshness_rejects_missing_or_invalid_timestamps():
    assert station_freshness(None)["data_status"] == "expired"
    assert station_freshness("not-a-timestamp")["data_status"] == "expired"


def test_current_station_contract_explains_source_and_quality(monkeypatch):
    now = datetime.now(UTC)

    async def stations():
        return (
            [
                {
                    "id": "fresh",
                    "name_th": "Fresh",
                    "lat": 13.8,
                    "lon": 100.1,
                    "pm25": 12.5,
                    "recorded_at": (now - timedelta(minutes=15)).isoformat(),
                },
                {
                    "id": "missing-delayed",
                    "name_th": "Delayed",
                    "lat": 13.8,
                    "lon": 100.2,
                    "pm25": None,
                    "recorded_at": (now - timedelta(minutes=75)).isoformat(),
                },
            ],
            "supabase",
        )

    monkeypatch.setattr(pm25, "get_current_stations", stations)
    response = TestClient(create_app()).get("/api/pm25/current")
    assert response.status_code == 200
    payload = response.json()
    assert payload["source"] == "air4thai"
    fresh, delayed = payload["stations"]
    assert fresh["quality_flags"] == []
    assert delayed["quality_flags"] == ["missing_pm25", "data_delayed"]
