from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

from backend.algorithms.map_history import select_map_history_stations
from backend.main import create_app
from backend.routers import history


def test_selects_latest_reading_at_or_before_target_and_ignores_future():
    stations = [
        {"id": "a", "name_th": "A", "lat": 13.75, "lon": 100.5},
        {"id": "b", "name_th": "B", "lat": 18.8, "lon": 98.9},
    ]
    readings = [
        {
            "station_id": "a",
            "pm25": 11,
            "aqi": 20,
            "recorded_at": "2026-09-19T08:00:00+00:00",
        },
        {
            "station_id": "a",
            "pm25": 14,
            "aqi": 24,
            "recorded_at": "2026-09-19T09:00:00+00:00",
        },
        {
            "station_id": "a",
            "pm25": 99,
            "aqi": 99,
            "recorded_at": "2026-09-19T10:01:00+00:00",
        },
    ]

    result = select_map_history_stations(
        stations,
        readings,
        target_at=datetime(2026, 9, 19, 10, tzinfo=UTC),
    )

    assert len(result) == 1
    assert result[0]["id"] == "a"
    assert result[0]["pm25"] == 14
    assert result[0]["recorded_at"] == "2026-09-19T09:00:00+00:00"
    assert result[0]["data_status"] == "fresh"


def test_excludes_missing_and_stale_readings():
    stations = [{"id": "a", "lat": 13.75, "lon": 100.5}]
    readings = [
        {
            "station_id": "a",
            "pm25": 20,
            "recorded_at": "2026-09-19T08:00:00+00:00",
        },
        {
            "station_id": "a",
            "pm25": None,
            "recorded_at": "2026-09-19T09:30:00+00:00",
        },
    ]

    result = select_map_history_stations(
        stations,
        readings,
        target_at=datetime(2026, 9, 19, 10, tzinfo=UTC),
        max_age_minutes=90,
    )

    assert result == []


def test_map_history_route_returns_station_snapshot(monkeypatch):
    async def snapshot(_target_at, *, max_age_minutes):
        assert max_age_minutes == 90
        return [
            {
                "id": "a",
                "name_th": "A",
                "lat": 13.75,
                "lon": 100.5,
                "pm25": 18.5,
                "recorded_at": "2026-09-19T08:00:00+00:00",
                "data_status": "fresh",
                "age_minutes": 0,
                "eligible_for_surface": True,
                "in_service_area": True,
                "quality_flags": ["historical_reading"],
            }
        ]

    monkeypatch.setattr(history, "get_map_history", snapshot)
    response = TestClient(create_app()).get(
        "/api/history/map",
        params={"at": (datetime.now(UTC) - timedelta(hours=1)).isoformat()},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["count"] == 1
    assert payload["stations"][0]["pm25"] == 18.5
