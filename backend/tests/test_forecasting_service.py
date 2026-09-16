from datetime import UTC, datetime, timedelta

import httpx
import pytest

from backend.services import forecasting


def test_provider_points_reject_stale_snapshots():
    now = datetime.now(UTC).replace(minute=0, second=0, microsecond=0)
    target = (now + timedelta(hours=3)).isoformat()
    snapshots = [
        {
            "provider": "openweather",
            "issued_at": (now - timedelta(hours=11)).isoformat(),
            "forecast_at": target,
            "pm25": 12,
        },
        {
            "provider": "openmeteo_cams",
            "issued_at": now.isoformat(),
            "forecast_at": target,
            "pm25": 18,
        },
    ]

    assert [
        row["source"] for row in forecasting._provider_points(snapshots, target)
    ] == ["openmeteo_cams"]


def test_surface_contract_is_hard_gated_to_official_stations(monkeypatch):
    monkeypatch.setattr(forecasting.supabase_client, "get_stations", lambda: [])

    response, ledgers = forecasting.surface_forecast(1, 4)

    assert response["source_policy"] == "official_stations_only"
    assert response["station_count"] == 0
    assert response["coverage_counts"]["unavailable"] == len(response["cells"])
    assert ledgers == []


@pytest.mark.parametrize("horizon", [1, 3, 6, 12, 24])
def test_surface_supports_product_horizons_and_reports_sparse_coverage(
    monkeypatch, horizon
):
    now = datetime.now(UTC)
    station = {
        "id": "station-a",
        "lat": 13.82,
        "lon": 100.06,
        "recorded_at": now.isoformat(),
    }
    monkeypatch.setattr(forecasting.supabase_client, "get_stations", lambda: [station])

    def station_result(_station_id, requested, **_kwargs):
        return (
            {
                "generated_at": now.isoformat(),
                "points": [
                    {
                        "pm25": 20,
                        "lower": 15,
                        "upper": 25,
                        "method": "fixture",
                    }
                    for _index in range(requested)
                ],
            },
            {"run": {"id": "fixture"}},
        )

    monkeypatch.setattr(forecasting, "station_forecast", station_result)

    response, ledgers = forecasting.surface_forecast(horizon, 4)

    assert response["horizon_hours"] == horizon
    assert response["station_count"] == 1
    assert "sparse_station_coverage" in response["warnings"]
    assert ledgers


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
    assert response["fallback_reason"] is None
    assert response["fallback_reason_codes"] == []
    assert [point["pm25"] for point in response["points"]] == [21, 22, 23]
    assert all(point["source"] == "openmeteo_cams" for point in response["points"])
    assert "official_observation_stale" not in response["limitation_reason_codes"]
    served = [row for row in ledger["predictions"] if row["variant"] == "served"]
    assert len(served) == 3


def test_station_forecast_keeps_external_result_when_optional_reads_fail(monkeypatch):
    now = datetime.now(UTC).replace(minute=0, second=0, microsecond=0)
    station = {"id": "station-a", "lat": 13.82, "lon": 100.06, "pm25": 18}
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

    def transport_error(*_args):
        raise httpx.ReadError("temporary Supabase disconnect")

    monkeypatch.setattr(
        forecasting.supabase_client, "get_station_by_id", lambda _id: station
    )
    monkeypatch.setattr(forecasting.supabase_client, "get_history", transport_error)
    monkeypatch.setattr(
        forecasting.supabase_client,
        "get_latest_forecast_features",
        transport_error,
    )
    monkeypatch.setattr(
        forecasting.supabase_client, "get_provider_snapshots", lambda _id: snapshots
    )
    monkeypatch.setattr(forecasting.supabase_client, "get_stations", transport_error)

    response, _ledger = forecasting.station_forecast("station-a", 3)

    assert response["forecast_mode"] == "external_provider"
    assert [point["pm25"] for point in response["points"]] == [21, 22, 23]
    assert response["fallback_reason"] is None
    assert {
        "official_history_temporarily_unavailable",
        "forecast_features_temporarily_unavailable",
        "community_context_temporarily_unavailable",
    }.issubset(response["warnings"])


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


def test_persist_ledger_writes_only_the_served_forecast_run(monkeypatch):
    inserted = []
    monkeypatch.setattr(
        forecasting.supabase_client,
        "insert_forecast_ledger",
        lambda run, predictions: inserted.append((run, predictions)),
    )
    ledger = {
        "run": {
            "id": "served-run",
            "station_id": "81t",
            "generated_at": "2026-09-16T00:00:00Z",
        },
        "predictions": [{"variant": "served"}],
        "source_details": [],
        "consensus_rows": [],
        "community_features": [],
    }

    forecasting.persist_ledger(ledger)

    assert [row[0]["id"] for row in inserted] == ["served-run"]
