"""Current Admin APIs must work after the local forecast tables are removed."""

import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from backend.core.config import settings
from backend.routers import admin
from backend.services import supabase_client
from scripts.production_preflight import REQUIRED_TABLES


def test_retired_admin_endpoints_do_not_open_database(monkeypatch):
    monkeypatch.setattr(settings, "forecast_system_paused", True)

    def unavailable():
        raise AssertionError("Retired forecast endpoints must not query dropped tables")

    monkeypatch.setattr(supabase_client, "get_client", unavailable)
    monkeypatch.setattr(admin, "artifact_statuses", unavailable)

    async def read_retired():
        return [
            await admin.forecast_models(_user=None),
            await admin.forecast_evaluation(days=14, _user=None),
            await admin.forecast_false_safe_cases(days=30, limit=100, _user=None),
            await admin.forecast_release_decisions(limit=100, _user=None),
        ]

    results = asyncio.run(read_retired())
    assert all(row["status"] == "retired" and row["count"] == 0 for row in results)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            admin.review_forecast_false_safe_case(
                run_id="removed",
                horizon_hours=1,
                variant="served",
                body=None,
                user=None,
            )
        )
    assert exc.value.status_code == 410


def test_provider_health_uses_retained_cams_tables_only(monkeypatch):
    monkeypatch.setattr(settings, "forecast_system_paused", True)
    monkeypatch.setattr(settings, "local_demo_mode", False)
    accessed = []

    class Query:
        def table(self, name):
            accessed.append(name)
            assert name == "forecast_provider_sync_runs"
            return self

        def select(self, *_args):
            return self

        def order(self, *_args, **_kwargs):
            return self

        def limit(self, *_args):
            return self

        def execute(self):
            return SimpleNamespace(data=[])

    monkeypatch.setattr(supabase_client, "get_client", Query)
    result = supabase_client.forecast_provider_health()
    assert accessed == ["forecast_provider_sync_runs"]
    assert result["consensus"]["station_count"] == 0


def test_production_preflight_requires_current_storage():
    assert "forecast_provider_snapshots" in REQUIRED_TABLES
    assert "forecast_provider_sync_runs" in REQUIRED_TABLES
    assert "forecast_data_quality_daily" in REQUIRED_TABLES
    assert not {
        "push_subscriptions",
        "forecast_consensus_latest",
        "forecast_prediction_sources",
        "community_forecast_feature_snapshots",
        "forecast_runs",
        "forecast_predictions",
        "forecast_evaluation_daily",
        "forecast_drift_snapshots",
        "forecast_false_safe_reviews",
        "model_registry",
        "forecast_release_decisions",
        "weather_forecasts",
    }.intersection(REQUIRED_TABLES)
