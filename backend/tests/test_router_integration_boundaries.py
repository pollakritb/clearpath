from __future__ import annotations

from datetime import UTC, datetime

from fastapi.testclient import TestClient

from backend.core import auth
from backend.core.config import settings
from backend.main import create_app
from backend.routers import admin, cron, forecast


def test_admin_data_health_route_returns_sanitized_operational_summary(monkeypatch):
    monkeypatch.setattr(settings, "local_demo_mode", True)
    monkeypatch.setattr(
        admin.data_health,
        "get_data_health",
        lambda: {
            "status": "healthy",
            "observed_at": "2026-09-16T05:00:00+00:00",
            "station_count": 177,
            "fresh_station_count": 170,
            "delayed_station_count": 7,
            "expired_station_count": 0,
            "stale_station_ratio": 0.0395,
            "latest_recorded_at": "2026-09-16T04:55:00+00:00",
            "latest_sync_status": "success",
            "latest_sync_started_at": "2026-09-16T04:59:00+00:00",
            "latest_sync_completed_at": "2026-09-16T04:59:02+00:00",
            "latest_sync_duration_ms": 2000,
            "latest_primary_sync_at": "2026-09-16T04:59:00+00:00",
            "latest_primary_sync_status": "success",
            "latest_backup_sync_at": None,
            "latest_backup_sync_status": None,
            "primary_sync_missed": False,
            "consecutive_sync_failures": 0,
            "upstream_failure": False,
            "alert_codes": [],
        },
    )

    response = TestClient(create_app()).get("/api/admin/data-health")

    assert response.status_code == 200
    assert response.json()["fresh_station_count"] == 170
    assert response.json()["upstream_failure"] is False


def test_community_and_admin_authorization_are_enforced_by_http_boundary(monkeypatch):
    monkeypatch.setattr(settings, "local_demo_mode", False)
    monkeypatch.setattr(
        auth.supabase_client,
        "get_auth_user",
        lambda _token: {
            "id": "user-1",
            "email": "user@example.test",
            "app_metadata": {"provider": "google"},
            "user_metadata": {},
        },
    )
    monkeypatch.setattr(
        auth.supabase_client,
        "ensure_profile",
        lambda user_id, _display_name, **_identity: {"id": user_id, "role": "user"},
    )
    client = TestClient(create_app())

    assert (
        client.get("/api/community/review-queue?lat=13.8&lon=100.1").status_code == 401
    )
    response = client.get(
        "/api/admin/reports", headers={"Authorization": "Bearer valid-user-token"}
    )
    assert response.status_code == 403


def test_admin_role_change_boundary_is_admin_only_and_audited_by_service(monkeypatch):
    monkeypatch.setattr(settings, "local_demo_mode", True)
    monkeypatch.setattr(
        admin.roles,
        "change_user_role",
        lambda **values: {
            "user_id": values["target_user_id"],
            "previous_role": "user",
            "role": values["new_role"],
            "changed_at": "2026-09-16T05:00:00+00:00",
        },
    )
    response = TestClient(create_app()).patch(
        "/api/admin/profiles/user-2/role",
        json={
            "role": "moderator",
            "reason": "Assigned to the exception review queue",
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "user_id": "user-2",
        "previous_role": "user",
        "role": "moderator",
        "changed_at": "2026-09-16T05:00:00+00:00",
    }


def test_forecast_router_rejects_service_and_viewport_contract_errors(monkeypatch):
    monkeypatch.setattr(settings, "forecast_system_paused", False)
    client = TestClient(create_app())

    def invalid_station(_station_id: str, _hours: int):
        raise ValueError("station_not_found")

    monkeypatch.setattr(forecast.forecasting, "station_forecast", invalid_station)
    response = client.get("/api/forecast?station_id=missing&hours=12")
    assert response.status_code == 422
    assert response.json()["detail"] == "station_not_found"

    assert client.get("/api/forecast/surface?min_lat=13").status_code == 422
    assert (
        client.get(
            "/api/forecast/surface?min_lat=14&max_lat=13&min_lon=100&max_lon=101"
        ).json()["detail"]
        == "surface_bounds_invalid"
    )
    assert (
        client.get(
            "/api/forecast/surface?min_lat=5&max_lat=20&min_lon=95&max_lon=110"
        ).json()["detail"]
        == "surface_bounds_exceed_500km"
    )

    monkeypatch.setattr(
        forecast.forecasting,
        "surface_forecast",
        lambda *_args: (_ for _ in ()).throw(ValueError("surface_unavailable")),
    )
    response = client.get("/api/forecast/surface")
    assert response.status_code == 422
    assert response.json()["detail"] == "surface_unavailable"


def test_cron_sync_runs_full_ingestion_boundary_and_records_success(monkeypatch):
    monkeypatch.setattr(settings, "local_demo_mode", False)
    monkeypatch.setattr(settings, "cron_secret", "cron-secret-value")
    monkeypatch.setattr(settings, "supabase_cron_secret", "")
    monkeypatch.setattr(settings, "forecast_system_paused", False)
    recorded_at = datetime.now(UTC).isoformat()
    stations = [
        {
            "id": "station-1",
            "lat": 13.8,
            "lon": 100.1,
            "pm25": 20,
            "recorded_at": recorded_at,
        }
    ]
    sync_updates: list[dict] = []

    async def fetch_stations():
        return stations

    async def collect_inputs(_stations):
        return {"stations": 1, "weather": 1, "fire_features": 1}

    monkeypatch.setattr(cron.air4thai, "fetch_stations", fetch_stations)
    monkeypatch.setattr(
        cron.air4thai,
        "get_last_ingestion_diagnostics",
        lambda: {
            "rejected_count": 0,
            "rejection_counts": {},
            "rejected_station_ids": [],
        },
    )
    sync_runs: list[dict] = []
    monkeypatch.setattr(
        cron.supabase_client,
        "create_sync_run",
        lambda row: sync_runs.append(row) or row,
    )
    monkeypatch.setattr(cron.supabase_client, "upsert_stations", lambda rows: len(rows))
    monkeypatch.setattr(cron.supabase_client, "insert_readings", lambda rows: len(rows))
    monkeypatch.setattr(
        cron.supabase_client,
        "update_sync_run",
        lambda _run_id, values: sync_updates.append(values),
    )
    monkeypatch.setattr(cron.forecast_data, "collect_forecast_inputs", collect_inputs)
    monkeypatch.setattr(
        cron.forecast_reconciliation,
        "reconcile_day",
        lambda: {"alert_codes": ["missing_source_hours"]},
    )
    monkeypatch.setattr(
        cron.retention,
        "cleanup_expired_reports",
        lambda: {"evidence_purged": 0},
    )
    client = TestClient(create_app())

    assert client.get("/api/cron/sync").status_code == 401
    response = client.get(
        "/api/cron/sync", headers={"Authorization": "Bearer cron-secret-value"}
    )
    assert response.status_code == 200
    assert response.json()["stations"] == 1
    assert response.json()["forecast_inputs"]["weather"] == 1
    assert sync_runs[-1]["source"] == "air4thai_github_backup"
    assert sync_updates[-1]["status"] == "success"
    assert sync_updates[-1]["source_recorded_at"] == recorded_at


def test_cron_job_routes_delegate_to_alert_evaluation_and_provider_services(
    monkeypatch,
):
    monkeypatch.setattr(settings, "local_demo_mode", False)
    monkeypatch.setattr(settings, "cron_secret", "cron-secret-value")
    monkeypatch.setattr(settings, "supabase_cron_secret", "")
    monkeypatch.setattr(settings, "forecast_system_paused", False)
    monkeypatch.setattr(settings, "gistda_air_enabled", False)
    monkeypatch.setattr(settings, "gistda_license_approved", False)

    async def alert_result():
        return {"events": 1}

    async def provider_result(provider: str, status: str):
        return {"ok": True, "provider": provider, "status": status}

    monkeypatch.setattr(cron.alert_service, "run_alerts", alert_result)
    monkeypatch.setattr(cron.notifications, "process_outbox", lambda: {"processed": 1})
    monkeypatch.setattr(
        cron.forecast_evaluation,
        "run_evaluation",
        lambda: {"alerts": {"alert_codes": ["forecast_drift"]}},
    )
    monkeypatch.setattr(
        cron.provider_sync,
        "sync_openweather",
        lambda: provider_result("openweather", "success"),
    )
    monkeypatch.setattr(
        cron.provider_sync,
        "sync_openweather_if_due",
        lambda: provider_result("openweather", "not_due"),
    )
    monkeypatch.setattr(
        cron.provider_sync,
        "sync_openmeteo",
        lambda: provider_result("openmeteo_cams", "success"),
    )
    monkeypatch.setattr(
        cron.provider_sync,
        "sync_openmeteo_if_due",
        lambda: provider_result("openmeteo_cams", "not_due"),
    )
    client = TestClient(create_app())
    headers = {"Authorization": "Bearer cron-secret-value"}

    assert client.get("/api/cron/alerts", headers=headers).json() == {
        "alerts": {"events": 1},
        "notification_outbox": {"processed": 1},
    }
    assert (
        client.get("/api/cron/forecast-evaluation", headers=headers).status_code == 200
    )
    assert (
        client.get("/api/cron/forecast-providers/openweather", headers=headers).json()[
            "status"
        ]
        == "success"
    )
    assert (
        client.get(
            "/api/cron/forecast-providers/openweather?only_if_due=true",
            headers=headers,
        ).json()["status"]
        == "not_due"
    )
    assert (
        client.get("/api/cron/forecast-providers/openmeteo", headers=headers).json()[
            "provider"
        ]
        == "openmeteo_cams"
    )
    gistda = client.get("/api/cron/forecast-providers/gistda", headers=headers).json()
    assert gistda["status"] == "disabled"
    assert gistda["reason"] == "licence_or_feature_gate_disabled"


def test_forecast_maintenance_returns_unavailable_without_generation(monkeypatch):
    monkeypatch.setattr(settings, "forecast_system_paused", True)
    monkeypatch.setattr(
        forecast.forecasting,
        "station_forecast",
        lambda *_args: (_ for _ in ()).throw(AssertionError("must not generate")),
    )
    monkeypatch.setattr(
        forecast.forecasting,
        "surface_forecast",
        lambda *_args: (_ for _ in ()).throw(AssertionError("must not generate")),
    )
    client = TestClient(create_app())

    station = client.get("/api/forecast?station_id=station-1&hours=12")
    assert station.status_code == 200
    assert station.headers["cache-control"] == "no-store, max-age=0"
    assert station.json()["forecast_status"] == "unavailable"
    assert station.json()["points"] == []
    assert station.json()["provider_count"] == 0
    assert station.json()["unavailable_reason_codes"] == [
        "forecast_system_under_improvement"
    ]

    surface = client.get("/api/forecast/surface?horizon=12&grid_size=8")
    assert surface.status_code == 200
    assert surface.json()["forecast_status"] == "unavailable"
    assert surface.json()["cells"] == []
    assert surface.json()["unavailable_reason_codes"] == [
        "forecast_system_under_improvement"
    ]


def test_forecast_maintenance_keeps_air4thai_sync_and_skips_forecast_writes(
    monkeypatch,
):
    monkeypatch.setattr(settings, "local_demo_mode", False)
    monkeypatch.setattr(settings, "cron_secret", "cron-secret-value")
    monkeypatch.setattr(settings, "supabase_cron_secret", "")
    monkeypatch.setattr(settings, "forecast_system_paused", True)
    recorded_at = datetime.now(UTC).isoformat()
    stations = [
        {
            "id": "station-1",
            "lat": 13.8,
            "lon": 100.1,
            "pm25": 20,
            "recorded_at": recorded_at,
        }
    ]

    async def fetch_stations():
        return stations

    monkeypatch.setattr(cron.air4thai, "fetch_stations", fetch_stations)
    monkeypatch.setattr(
        cron.air4thai,
        "get_last_ingestion_diagnostics",
        lambda: {
            "rejected_count": 0,
            "rejection_counts": {},
            "rejected_station_ids": [],
        },
    )
    monkeypatch.setattr(cron.supabase_client, "create_sync_run", lambda row: row)
    monkeypatch.setattr(cron.supabase_client, "upsert_stations", lambda rows: len(rows))
    monkeypatch.setattr(cron.supabase_client, "insert_readings", lambda rows: len(rows))
    monkeypatch.setattr(cron.supabase_client, "update_sync_run", lambda *_args: None)
    monkeypatch.setattr(
        cron.forecast_data,
        "collect_forecast_inputs",
        lambda *_args: (_ for _ in ()).throw(AssertionError("must stay paused")),
    )
    monkeypatch.setattr(
        cron.forecast_reconciliation,
        "reconcile_day",
        lambda: (_ for _ in ()).throw(AssertionError("must stay paused")),
    )
    monkeypatch.setattr(
        cron.retention, "cleanup_expired_reports", lambda: {"evidence_purged": 0}
    )
    client = TestClient(create_app())
    headers = {"Authorization": "Bearer cron-secret-value"}

    sync = client.get("/api/cron/sync", headers=headers)
    assert sync.status_code == 200
    assert sync.json()["readings"] == 1
    assert sync.json()["forecast_inputs"]["status"] == "paused"
    assert sync.json()["reconciliation"]["status"] == "paused"

    for path in (
        "/api/cron/forecast-evaluation",
        "/api/cron/forecast-providers/openweather",
        "/api/cron/forecast-providers/openmeteo",
        "/api/cron/forecast-providers/gistda",
    ):
        response = client.get(path, headers=headers)
        assert response.status_code == 200
        assert response.json()["status"] == "paused"
        assert response.json()["reason"] == "forecast_system_under_improvement"
