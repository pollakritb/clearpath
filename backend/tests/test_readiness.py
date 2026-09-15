from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

from backend.main import create_app
from backend.services import readiness


def test_readiness_reports_fresh_source_of_truth(monkeypatch):
    monkeypatch.setattr(
        readiness.supabase_client,
        "get_stations",
        lambda: [
            {
                "id": "np-1",
                "recorded_at": (datetime.now(UTC) - timedelta(minutes=10)).isoformat(),
            }
        ],
    )
    response = TestClient(create_app()).get("/api/ready")
    assert response.status_code == 200
    assert response.json()["status"] == "ready"
    assert response.json()["fresh_station_count"] == 1
    assert response.json()["delayed_station_count"] == 0
    assert response.json()["expired_station_count"] == 0
    assert response.json()["fresh_max_age_minutes"] == 60
    assert response.json()["surface_max_age_minutes"] == 90


def test_readiness_does_not_label_delayed_data_as_fresh(monkeypatch):
    monkeypatch.setattr(
        readiness.supabase_client,
        "get_stations",
        lambda: [
            {
                "id": "np-delayed",
                "recorded_at": (datetime.now(UTC) - timedelta(minutes=75)).isoformat(),
            }
        ],
    )
    response = TestClient(create_app()).get("/api/ready")
    assert response.status_code == 503
    assert response.json()["reason"] == "station_data_stale"
    assert response.json()["fresh_station_count"] == 0
    assert response.json()["delayed_station_count"] == 1
    assert response.json()["expired_station_count"] == 0


def test_readiness_fails_closed_when_data_is_stale(monkeypatch):
    monkeypatch.setattr(
        readiness.supabase_client,
        "get_stations",
        lambda: [
            {
                "id": "np-old",
                "recorded_at": (datetime.now(UTC) - timedelta(hours=3)).isoformat(),
            }
        ],
    )
    response = TestClient(create_app()).get("/api/ready")
    assert response.status_code == 503
    assert response.json()["reason"] == "station_data_stale"


def test_readiness_hides_upstream_exception(monkeypatch):
    def fail():
        raise RuntimeError("secret connection detail")

    monkeypatch.setattr(readiness.supabase_client, "get_stations", fail)
    response = TestClient(create_app()).get("/api/ready")
    assert response.status_code == 503
    assert response.json()["reason"] == "source_of_truth_unavailable"
    assert "secret" not in response.text
