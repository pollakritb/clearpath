from datetime import UTC, datetime, timedelta

from backend.services import forecasting


def test_surface_contract_is_hard_gated_to_official_stations(monkeypatch):
    monkeypatch.setattr(forecasting.supabase_client, "get_stations", lambda: [])

    response, ledgers = forecasting.surface_forecast(1, 4)

    assert response["source_policy"] == "official_stations_only"
    assert response["station_count"] == 0
    assert response["coverage_counts"]["unavailable"] == len(response["cells"])
    assert ledgers == []


def test_station_forecast_serves_external_when_official_history_is_missing(monkeypatch):
    now = datetime.now(UTC).replace(minute=0, second=0, microsecond=0)
    station = {"id": "station-a", "lat": 13.82, "lon": 100.06, "pm25": None}
    snapshots = [
        {
            "station_id": "station-a",
            "provider": "openmeteo_cams",
            "issued_at": now.isoformat(),
            "forecast_at": (now + timedelta(hours=horizon)).isoformat(),
            "horizon_hours": horizon,
            "pm25": 20 + horizon,
        }
        for horizon in range(1, 4)
    ]
    monkeypatch.setattr(
        forecasting.supabase_client, "get_station_by_id", lambda _id: station
    )
    monkeypatch.setattr(forecasting.supabase_client, "get_history", lambda *_args: [])
    monkeypatch.setattr(
        forecasting.supabase_client, "get_latest_forecast_features", lambda _id: {}
    )
    monkeypatch.setattr(
        forecasting.supabase_client, "get_provider_snapshots", lambda _id: snapshots
    )
    monkeypatch.setattr(forecasting.supabase_client, "get_stations", lambda: [station])
    monkeypatch.setattr(
        forecasting.supabase_client, "list_community_reports", lambda *_args: []
    )

    response, ledger = forecasting.station_forecast("station-a", 3)

    assert response["forecast_status"] == "limited"
    assert response["forecast_mode"] == "external_provider"
    assert response["recommended_source"] == "openmeteo_cams"
    assert [point["pm25"] for point in response["points"]] == [21, 22, 23]
    assert all(point["source"] == "openmeteo_cams" for point in response["points"])
    assert "official_observation_stale" not in response["limitation_reason_codes"]
    assert len(ledger["predictions"]) == 3


def test_qualified_community_fails_closed_and_accepts_policy_paths(monkeypatch):
    base = {
        "status": "approved",
        "is_fresh": True,
        "trust_score": 70,
        "corroboration_count": 2,
        "device_calibrated": False,
        "near_emission_source": False,
        "duplicate_detected": False,
        "gps_accuracy_m": 50,
    }
    rows = [
        {**base, "id": "corroborated"},
        {
            **base,
            "id": "calibrated",
            "trust_score": 85,
            "corroboration_count": 1,
            "device_calibrated": True,
        },
        {**base, "id": "missing-gps", "gps_accuracy_m": None},
        {**base, "id": "duplicate", "duplicate_detected": True},
        {**base, "id": "low-trust", "trust_score": 59},
    ]
    monkeypatch.setattr(
        forecasting.supabase_client,
        "list_community_reports",
        lambda *_args: rows,
    )
    monkeypatch.setattr(
        forecasting,
        "present_report",
        lambda row, **_kwargs: row,
    )

    qualified = forecasting._qualified_community([])

    assert [row["id"] for row in qualified] == ["corroborated", "calibrated"]
